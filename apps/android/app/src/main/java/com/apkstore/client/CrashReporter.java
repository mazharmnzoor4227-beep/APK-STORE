package com.apkstore.client;

import android.content.Context;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Comparator;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Production-safe crash reporting.
 *
 * - Installed as the global uncaught-exception handler from MainActivity.onCreate.
 * - Persists the report to a file synchronously (fast, never needs network).
 * - Uploads to the crash-report Edge Function on a background thread; any report
 *   that cannot be uploaded immediately is retried on the next app start.
 * - Never throws, never blocks startup, never loops: all work is guarded and the
 *   previous default handler's behavior is always preserved.
 * - Sends only technical diagnostics (app version, Android version, device model,
 *   exception type/message, stack trace, screen). No personal data.
 */
final class CrashReporter {
    private static final String DIR = "crash_reports";
    private static final int MAX_STORED = 5;
    private static final ExecutorService uploader = Executors.newSingleThreadExecutor();
    private static volatile boolean installed;
    private static volatile String screen = "main";

    private CrashReporter() {}

    static void setScreen(String value) {
        if (value != null && !value.isEmpty()) screen = value;
    }

    static void install(Context context) {
        if (installed) return;
        installed = true;
        final Context app = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try { persist(app, throwable); } catch (Throwable ignored) { }
            // Best effort: try now, but the reliable path is the retry on next start.
            uploader.execute(() -> { try { uploadAll(app); } catch (Throwable ignored) { } });
            if (previous != null) previous.uncaughtException(thread, throwable);
            else android.os.Process.killProcess(android.os.Process.myPid());
        });
        // Retry anything persisted by an earlier crash. Off the UI thread, never blocking.
        uploader.execute(() -> { try { uploadAll(app); } catch (Throwable ignored) { } });
    }

    private static File directory(Context app) {
        File dir = new File(app.getFilesDir(), DIR);
        // noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        return dir;
    }

    private static void persist(Context app, Throwable throwable) throws Exception {
        JSONObject payload = buildPayload(app, throwable);
        File dir = directory(app);
        File[] existing = dir.listFiles();
        if (existing != null && existing.length >= MAX_STORED) {
            Arrays.sort(existing, Comparator.comparingLong(File::lastModified));
            for (int i = 0; i <= existing.length - MAX_STORED; i++) {
                // noinspection ResultOfMethodCallIgnored
                existing[i].delete();
            }
        }
        File out = new File(dir, "crash-" + System.currentTimeMillis() + ".json");
        try (FileOutputStream stream = new FileOutputStream(out)) {
            stream.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
    }

    private static JSONObject buildPayload(Context app, Throwable throwable) throws Exception {
        StringBuilder stack = new StringBuilder();
        for (StackTraceElement el : throwable.getStackTrace()) stack.append(el.toString()).append('\n');
        Throwable cause = throwable.getCause();
        if (cause != null && cause != throwable) {
            stack.append("Caused by: ").append(cause).append('\n');
            for (StackTraceElement el : cause.getStackTrace()) stack.append(el.toString()).append('\n');
        }
        return new JSONObject()
                .put("package_id", app.getPackageName())
                .put("app_version", BuildConfig.VERSION_NAME)
                .put("version_code", BuildConfig.VERSION_CODE)
                .put("android_version", android.os.Build.VERSION.RELEASE)
                .put("device_model", android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL)
                .put("exception_type", throwable.getClass().getName())
                .put("message", String.valueOf(throwable.getMessage()))
                .put("stack", stack.toString())
                .put("screen", screen);
    }

    private static void uploadAll(Context app) {
        File dir = directory(app);
        File[] files = dir.listFiles();
        if (files == null || files.length == 0) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File file : files) {
            try {
                String body = new String(java.nio.file.Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
                if (post(app, body)) {
                    // noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
            } catch (Throwable ignored) {
                // Keep the file; retry on the next start.
            }
        }
    }

    private static boolean post(Context app, String body) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(
                    BuildConfig.SUPABASE_URL + "/functions/v1/crash-report").openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(10000);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
            connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
            connection.setDoOutput(true);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (java.io.OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int code = connection.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Throwable ignored) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
