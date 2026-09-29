package com.apkstore.client;

import android.content.Context;
import android.os.Build;
import org.json.JSONObject;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.Date;
import java.util.Locale;

final class CrashReporter {
    private static final int MAX_STACK = 16000;
    private static Thread.UncaughtExceptionHandler previous;

    private CrashReporter() {}

    static synchronized void install(Context context) {
        if (previous != null) return;
        Context app = context.getApplicationContext();
        previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                new CrashQueue(app).enqueue(payload(error, System.currentTimeMillis()).toString(), System.currentTimeMillis());
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

    static JSONObject payload(Throwable error, long occurredAt) throws Exception {
        StringWriter writer = new StringWriter();
        error.printStackTrace(new PrintWriter(writer));
        String stack = safe(writer.toString(), MAX_STACK);
        String exception = safe(error.getClass().getName(), 180);
        String message = safe(error.getMessage(), 1000);
        JSONObject json = new JSONObject();
        json.put("fingerprint", CrashFingerprint.of(error));
        json.put("package_id", StoreIdentity.PACKAGE_ID);
        json.put("version_code", BuildConfig.VERSION_CODE);
        json.put("version_name", BuildConfig.VERSION_NAME);
        json.put("android_sdk", Build.VERSION.SDK_INT);
        json.put("device_manufacturer", safe(Build.MANUFACTURER, 80));
        json.put("device_model", safe(Build.MODEL, 120));
        json.put("exception_class", exception);
        json.put("message", message);
        json.put("stack_trace", stack);
        json.put("occurred_at", new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.ROOT).format(new Date(occurredAt)));
        return json;
    }

    static String safe(String value, int max) {
        if (value == null) return "";
        String cleaned = value.replaceAll("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "");
        return cleaned.substring(0, Math.min(max, cleaned.length()));
    }
}
