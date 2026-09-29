package com.apkstore.client;

import android.content.Context;
import android.os.Build;
import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

final class CrashReporter {
    private static final String DIR = "crash-reports";
    private static final int MAX_REPORTS = 8;
    private static final int MAX_STACK = 16000;
    private static Thread.UncaughtExceptionHandler previous;

    private CrashReporter() {}

    static void install(Context context) {
        if (previous != null) return;
        Context app = context.getApplicationContext();
        previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try { persist(app, error, System.currentTimeMillis()); } catch (Throwable ignored) {}
            if (previous != null) previous.uncaughtException(thread, error);
        });
    }

    static void uploadPending(Context context) {
        File[] files = directory(context).listFiles((d, n) -> n.endsWith(".json"));
        if (files == null || files.length == 0) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        for (File file : files) {
            HttpURLConnection connection = null;
            try {
                byte[] body = java.nio.file.Files.readAllBytes(file.toPath());
                connection = (HttpURLConnection) new URL(BuildConfig.SUPABASE_URL + "/functions/v1/report-crash").openConnection();
                connection.setConnectTimeout(6000); connection.setReadTimeout(6000);
                connection.setRequestMethod("POST"); connection.setDoOutput(true);
                connection.setRequestProperty("content-type", "application/json");
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
                connection.getOutputStream().write(body);
                if (connection.getResponseCode() == 202) file.delete(); else break;
            } catch (Exception ignored) { break; }
            finally { if (connection != null) connection.disconnect(); }
        }
    }

    static JSONObject payload(Throwable error, long occurredAt) throws Exception {
        StringWriter writer = new StringWriter();
        error.printStackTrace(new PrintWriter(writer));
        String stack = writer.toString();
        if (stack.length() > MAX_STACK) stack = stack.substring(0, MAX_STACK);
        String exception = safe(error.getClass().getName(), 180);
        String message = safe(error.getMessage(), 1000);
        String stable = exception;
        StackTraceElement[] frames = error.getStackTrace();
        for (int i = 0; i < Math.min(5, frames.length); i++) stable += "|" + frames[i].getClassName() + "." + frames[i].getMethodName() + ":" + frames[i].getLineNumber();
        JSONObject json = new JSONObject();
        json.put("fingerprint", sha256(stable));
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

    private static void persist(Context context, Throwable error, long time) throws Exception {
        File dir = directory(context);
        File[] old = dir.listFiles((d, n) -> n.endsWith(".json"));
        if (old != null && old.length >= MAX_REPORTS) {
            Arrays.sort(old, Comparator.comparingLong(File::lastModified));
            for (int i = 0; i <= old.length - MAX_REPORTS; i++) old[i].delete();
        }
        try (FileOutputStream out = new FileOutputStream(new File(dir, time + ".json"))) {
            out.write(payload(error, time).toString().getBytes(StandardCharsets.UTF_8));
        }
    }
    private static File directory(Context c) { File d = new File(c.getFilesDir(), DIR); if (!d.exists()) d.mkdirs(); return d; }
    private static String safe(String s, int max) { if (s == null) return ""; return s.substring(0, Math.min(max, s.length())).replace("\u0000", ""); }
    private static String sha256(String s) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder(64); for (byte b : digest) out.append(String.format(Locale.ROOT, "%02x", b)); return out.toString();
    }
}
