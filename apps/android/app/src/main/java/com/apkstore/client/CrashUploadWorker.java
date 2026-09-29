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

public final class CrashUploadWorker extends Worker {
    public CrashUploadWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull @Override public Result doWork() {
        File report = CrashReporter.pendingFile(getApplicationContext());
        if (!report.isFile()) return Result.success();
        HttpURLConnection connection = null;
        try {
            byte[] body = java.nio.file.Files.readAllBytes(report.toPath());
            if (body.length == 0 || body.length > 48 * 1024) {
                report.delete();
                return Result.failure();
            }
            connection = (HttpURLConnection) new URL(
                    BuildConfig.SUPABASE_URL + "/functions/v1/crash-report").openConnection();
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body); }
            int code = connection.getResponseCode();
            if (code >= 200 && code < 300) {
                report.delete();
                return Result.success();
            }
            if (code >= 400 && code < 500 && code != 408 && code != 429) {
                report.delete();
                return Result.failure();
            }
            return Result.retry();
        } catch (Exception ignored) {
            return Result.retry();
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
