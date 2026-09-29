package com.apkstore.client;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;

final class CrashFingerprint {
    private CrashFingerprint() {}

    static String of(Throwable error) throws Exception {
        StringBuilder stable = new StringBuilder(error.getClass().getName());
        StackTraceElement[] frames = error.getStackTrace();
        for (int i = 0; i < Math.min(5, frames.length); i++) {
            StackTraceElement frame = frames[i];
            stable.append('|').append(frame.getClassName()).append('.').append(frame.getMethodName()).append(':').append(frame.getLineNumber());
        }
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(stable.toString().getBytes(StandardCharsets.UTF_8));
        StringBuilder output = new StringBuilder(64);
        for (byte value : digest) output.append(String.format(Locale.ROOT, "%02x", value & 0xff));
        return output.toString();
    }
}
