package com.apkstore.client;

import org.json.JSONObject;

import java.io.File;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

final class CrashUploadClient {
    enum Outcome { ACKNOWLEDGE, DISCARD, RETRY }

    private CrashUploadClient() {}

    static Outcome classifyStatus(int status) {
        if (status == 202 || status == 200) return Outcome.ACKNOWLEDGE;
        if (status == 429 || status >= 500) return Outcome.RETRY;
        if (status >= 400 && status < 500) return Outcome.DISCARD;
        return Outcome.RETRY;
    }

    static boolean locallyValid(byte[] body) {
        if (body == null || body.length == 0 || body.length > CrashQueue.MAX_REPORT_BYTES) return false;
        try {
            JSONObject json = new JSONObject(new String(body, StandardCharsets.UTF_8));
            return StoreIdentity.PACKAGE_ID.equals(json.optString("package_id"))
                    && json.optString("fingerprint").matches("[0-9a-f]{64}")
                    && json.optLong("version_code", 0) > 0
                    && !json.optString("version_name").isBlank()
                    && !json.optString("exception_class").isBlank()
                    && !json.optString("stack_trace").isBlank()
                    && !json.optString("occurred_at").isBlank();
        } catch (Exception ignored) {
            return false;
        }
    }

    static void uploadPending(CrashQueue queue) {
        for (File file : queue.pending()) {
            HttpURLConnection connection = null;
            try {
                byte[] body = Files.readAllBytes(file.toPath());
                if (!locallyValid(body)) {
                    queue.acknowledge(file);
                    continue;
                }
                connection = (HttpURLConnection) new URL(BuildConfig.SUPABASE_URL + "/functions/v1/report-crash").openConnection();
                connection.setConnectTimeout(6000);
                connection.setReadTimeout(6000);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("content-type", "application/json");
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
                Outcome outcome = classifyStatus(connection.getResponseCode());
                if (outcome == Outcome.ACKNOWLEDGE || outcome == Outcome.DISCARD) queue.acknowledge(file);
                if (outcome == Outcome.RETRY) break;
            } catch (Exception ignored) {
                break;
            } finally {
                if (connection != null) connection.disconnect();
            }
        }
    }
}
