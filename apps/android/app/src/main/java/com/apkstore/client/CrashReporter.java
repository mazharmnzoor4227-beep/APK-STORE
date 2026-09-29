package com.apkstore.client;

import android.content.Context;
import android.os.Build;
import org.json.JSONObject;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Date;
import java.util.Locale;

final class CrashReporter {
    private static final int MAX_MESSAGE = 2 * 1024;
    private static final int MAX_STACK = 32 * 1024;
    private static Thread.UncaughtExceptionHandler previous;
    private static boolean installed;

    private CrashReporter() {}

    static synchronized void install(Context context) {
        if (installed) return;
        installed = true;
        Context app = context.getApplicationContext();
        previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                long now = System.currentTimeMillis();
                new CrashQueue(app).enqueue(payload(error, now).toString(), now);
            } catch (Throwable ignored) {
                // Crash diagnostics must never replace or mask the original app failure.
            } finally {
                if (previous != null) previous.uncaughtException(thread, error);
            }
        });
    }

    static void uploadPending(Context context) {
        CrashUploadClient.uploadPending(new CrashQueue(context.getApplicationContext()));
    }

    static void recordHandled(Context context, String category, String message, Throwable error) {
        try {
            long now = System.currentTimeMillis();
            new CrashQueue(context.getApplicationContext()).enqueue(handledPayload(category, message, error, now).toString(), now);
        } catch (Throwable ignored) {
            // Diagnostics are best-effort and must never break the user flow.
        }
    }

    static JSONObject payload(Throwable error, long occurredAt) throws Exception {
        StringWriter writer = new StringWriter();
        error.printStackTrace(new PrintWriter(writer));
        String stack = safe(writer.toString(), MAX_STACK);
        String exception = safe(error.getClass().getName(), 180);
        String message = safe(error.getMessage(), MAX_MESSAGE);
        return basePayload(CrashFingerprint.of(error), exception, message, stack, occurredAt);
    }

    static JSONObject handledPayload(String category, String message, Throwable error, long occurredAt) throws Exception {
        String safeCategory = category == null ? "unknown" : category.replaceAll("[^a-zA-Z0-9_]+", "_").toLowerCase(Locale.ROOT);
        Throwable actual = error == null ? new RuntimeException(message == null ? "Handled error" : message) : error;
        StringWriter writer = new StringWriter();
        actual.printStackTrace(new PrintWriter(writer));
        String stack = safe(writer.toString(), MAX_STACK);
        return basePayload(
                CrashFingerprint.ofHandled(safeCategory, actual),
                "HandledError." + safeCategory,
                safe(message == null || message.isBlank() ? actual.getMessage() : message, MAX_MESSAGE),
                stack,
                occurredAt);
    }

    private static JSONObject basePayload(String fingerprint, String exception, String message, String stack, long occurredAt) throws Exception {
        JSONObject json = new JSONObject();
        json.put("fingerprint", fingerprint);
        json.put("package_id", StoreIdentity.PACKAGE_ID);
        json.put("version_code", BuildConfig.VERSION_CODE);
        json.put("version_name", BuildConfig.VERSION_NAME);
        json.put("android_sdk", Build.VERSION.SDK_INT);
        json.put("device_manufacturer", safe(Build.MANUFACTURER, 80));
        json.put("device_model", safe(Build.MODEL, 120));
        json.put("exception_class", safe(exception, 180));
        json.put("message", safe(message, MAX_MESSAGE));
        json.put("stack_trace", safe(stack, MAX_STACK));
        json.put("occurred_at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.ROOT).format(new Date(occurredAt)));
        return json;
    }

    static String safe(String value, int max) {
        if (value == null) return "";
        String cleaned = value
                .replaceAll("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "")
                .replaceAll("(?i)(authorization\\s*:\\s*bearer\\s+)[A-Za-z0-9._~+\\-/=]+", "$1[redacted]")
                .replaceAll("(?i)(apikey|api_key|token|password|secret)=([^\\s&]+)", "$1=[redacted]")
                .replaceAll("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", "[email]")
                .replaceAll("(?i)https?://[^\\s)\\]]+", "[url]");
        return cleaned.substring(0, Math.min(max, cleaned.length()));
    }
}
