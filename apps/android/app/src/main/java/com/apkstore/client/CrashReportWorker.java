package com.apkstore.client;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class CrashReportWorker extends Worker {
    CrashReportWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull @Override public Result doWork() {
        CrashQueue queue = CrashReporter.queue(getApplicationContext());
        try {
            for (File report : queue.pending()) {
                String body = queue.read(report);
                int status = post(body);
                if (status >= 200 && status < 300) {
                    queue.delete(report);
                    continue;
                }
                if (status == 408 || status == 429 || status >= 500) return Result.retry();
                if (status >= 400 && status < 500) {
                    // A permanently malformed/rejected report must not retry forever.
                    queue.delete(report);
                    continue;
                }
                return Result.retry();
            }
            return Result.success();
        } catch (Exception transientFailure) {
            return Result.retry();
        }
    }

    private int post(String body) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(
                BuildConfig.SUPABASE_URL + "/functions/v1/crash-report").openConnection();
        try {
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            connection.setDoOutput(true);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            connection.getOutputStream().write(bytes);
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream != null) try (InputStream input = stream) {
                byte[] buffer = new byte[1024];
                while (input.read(buffer) != -1) { /* drain response for connection reuse */ }
            }
            return status;
        } finally {
            connection.disconnect();
        }
    }
}
