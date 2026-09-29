package com.apkstore.client;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

final class CrashFingerprint {
    private CrashFingerprint() {}

    static String of(Throwable error) throws Exception {
        return digest(stableFrames(error.getClass().getName(), error));
    }

    static String ofHandled(String category, Throwable error) throws Exception {
        String safeCategory = category == null ? "unknown" : category.replaceAll("[^a-z0-9_]+", "_").toLowerCase(Locale.ROOT);
        return digest(stableFrames("HandledError." + safeCategory, error));
    }

    private static String stableFrames(String prefix, Throwable error) {
        StringBuilder stable = new StringBuilder(prefix);
        StackTraceElement[] frames = error == null ? new StackTraceElement[0] : error.getStackTrace();
        for (int i = 0; i < Math.min(5, frames.length); i++) {
            StackTraceElement frame = frames[i];
            stable.append('|').append(frame.getClassName()).append('.').append(frame.getMethodName()).append(':').append(frame.getLineNumber());
        }
        return stable.toString();
    }

    private static String digest(String value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder output = new StringBuilder(64);
        for (byte item : digest) output.append(String.format(Locale.ROOT, "%02x", item & 0xff));
        return output.toString();
    }
}
