package com.apkstore.client;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.os.Build;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

final class CrashReporter {
    static final String SIGNER_SHA256 = "cd5fff73675c8c783db51a3300cc06845763215d2c7b03a64ae7f9b589360585";
    private static final String FILE_NAME = "pending-crash.json";
    private static volatile boolean installed;

    private CrashReporter() {}

    static void install(Context context) {
        if (installed) return;
        synchronized (CrashReporter.class) {
            if (installed) return;
            final Context app = context.getApplicationContext();
            final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
            Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
                try { persist(app, error); } catch (Throwable ignored) { }
                if (previous != null) previous.uncaughtException(thread, error);
                else {
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(10);
                }
            });
            installed = true;
        }
    }

    static void enqueuePending(Context context) {
        if (!pendingFile(context).isFile()) return;
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CrashUploadWorker.class)
                .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
                "pending-crash-upload", androidx.work.ExistingWorkPolicy.KEEP, request);
    }

    static File pendingFile(Context context) {
        return new File(context.getFilesDir(), FILE_NAME);
    }

    private static void persist(Context context, Throwable error) throws Exception {
        PackageInfo info = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
        StringWriter trace = new StringWriter();
        error.printStackTrace(new PrintWriter(trace));
        JSONObject body = new JSONObject()
                .put("fingerprint", SIGNER_SHA256)
                .put("package_id", context.getPackageName())
                .put("version_code", info.getLongVersionCode())
                .put("version_name", info.versionName == null ? "" : info.versionName)
                .put("android_sdk", Build.VERSION.SDK_INT)
                .put("device_manufacturer", safe(Build.MANUFACTURER, 80))
                .put("device_model", safe(Build.MODEL, 120))
                .put("exception_class", safe(error.getClass().getName(), 180))
                .put("message", safe(error.getMessage(), 2048))
                .put("stack_trace", safe(trace.toString(), 32768))
                .put("occurred_at", java.time.Instant.now().toString())
                .put("report_type", "crash");
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        File target = pendingFile(context), temp = new File(context.getFilesDir(), FILE_NAME + ".tmp");
        try (FileOutputStream out = new FileOutputStream(temp)) {
            out.write(bytes);
            out.getFD().sync();
        }
        if (target.exists() && !target.delete()) return;
        temp.renameTo(target);
    }

    private static String safe(String value, int max) {
        if (value == null) return "";
        value = value.replaceAll("(?i)(authorization\\s*:\\s*bearer\\s+)[A-Za-z0-9._~+\\-/=]+", "$1[redacted]")
                .replaceAll("(?i)(apikey|api_key|token|password|secret)=([^\\s&]+)", "$1=[redacted]")
                .replaceAll("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", "[email]")
                .replaceAll("https?://[^\\s)\\]]+", "[url]");
        return value.length() <= max ? value : value.substring(0, max);
    }
}
