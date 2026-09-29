package com.apkstore.client;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;
import java.util.regex.Pattern;

final class CrashReportPayload {
    private static final int MAX_MESSAGE = 1024;
    private static final int MAX_STACK = 16 * 1024;
    private static final Pattern BEARER = Pattern.compile("(?i)\\bBearer\\s+[A-Za-z0-9._~+\\-/]+=*");
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile("(?i)\\b(token|password|secret|api[_-]?key|authorization)\\s*[:=]\\s*[^\\s,;]+", Pattern.CASE_INSENSITIVE);
    private static final Pattern EMAIL = Pattern.compile("(?i)\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b");
    private static final Pattern URL = Pattern.compile("(?i)https?://[^\\s]+", Pattern.CASE_INSENSITIVE);

    private CrashReportPayload() {}

    static Map<String, Object> create(String packageId, long versionCode, String versionName,
                                      int androidSdk, String manufacturer, String model,
                                      Throwable error, long occurredAtMillis) {
        LinkedHashMap<String, Object> payload = new LinkedHashMap<>();
        payload.put("fingerprint", fingerprint(error));
        payload.put("package_id", packageId);
        payload.put("version_code", versionCode);
        payload.put("version_name", safe(versionName, 64));
        payload.put("android_sdk", androidSdk);
        payload.put("device_manufacturer", sanitize(manufacturer, 128));
        payload.put("device_model", sanitize(model, 128));
        payload.put("exception_class", error == null ? "java.lang.Throwable" : safe(error.getClass().getName(), 256));
        payload.put("message", sanitize(error == null ? "" : String.valueOf(error.getMessage()), MAX_MESSAGE));
        payload.put("stack_trace", stackTrace(error));
        payload.put("occurred_at", isoUtc(occurredAtMillis));
        return payload;
    }

    static String fingerprint(Throwable error) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            StringBuilder canonical = new StringBuilder();
            if (error == null) {
                canonical.append("java.lang.Throwable");
            } else {
                canonical.append(error.getClass().getName());
                StackTraceElement[] frames = error.getStackTrace();
                int count = Math.min(frames == null ? 0 : frames.length, 12);
                for (int i = 0; i < count; i++) {
                    StackTraceElement frame = frames[i];
                    canonical.append('\n').append(frame.getClassName())
                            .append('#').append(frame.getMethodName())
                            .append(':').append(frame.getLineNumber());
                }
            }
            byte[] hash = digest.digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder(64);
            for (byte value : hash) out.append(String.format(Locale.ROOT, "%02x", value & 0xff));
            return out.toString();
        } catch (Exception impossible) {
            return repeatZero();
        }
    }

    private static String stackTrace(Throwable error) {
        if (error == null) return "java.lang.Throwable";
        StringBuilder out = new StringBuilder();
        out.append(error.getClass().getName());
        String message = sanitize(String.valueOf(error.getMessage()), MAX_MESSAGE);
        if (!message.isEmpty() && !"null".equals(message)) out.append(": ").append(message);
        StackTraceElement[] frames = error.getStackTrace();
        if (frames != null) {
            for (StackTraceElement frame : frames) {
                if (out.length() >= MAX_STACK) break;
                out.append("\n\tat ").append(frame.toString());
            }
        }
        return sanitize(out.toString(), MAX_STACK);
    }

    private static String sanitize(String value, int limit) {
        String text = value == null ? "" : value;
        text = BEARER.matcher(text).replaceAll("Bearer [redacted]");
        text = SECRET_ASSIGNMENT.matcher(text).replaceAll("$1=[redacted]");
        text = EMAIL.matcher(text).replaceAll("[email]");
        text = URL.matcher(text).replaceAll("[url]");
        return safe(text, limit);
    }

    private static String safe(String value, int limit) {
        if (value == null) return "";
        return value.length() <= limit ? value : value.substring(0, limit);
    }

    private static String isoUtc(long millis) {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date(millis));
    }

    private static String repeatZero() {
        StringBuilder value = new StringBuilder(64);
        for (int i = 0; i < 64; i++) value.append('0');
        return value.toString();
    }
}
