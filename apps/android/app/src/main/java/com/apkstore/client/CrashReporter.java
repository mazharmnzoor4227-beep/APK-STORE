package com.apkstore.client;

import android.content.Context;
import android.os.Build;
import androidx.work.BackoffPolicy;
import androidx.work.Configuration;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import java.io.File;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONObject;

final class CrashReporter {
    private static final String UNIQUE_UPLOAD = "apk-store-crash-report-upload";
    private static final AtomicBoolean INSTALLED = new AtomicBoolean(false);

    private CrashReporter() {}

    static void install(Context context) {
        if (!INSTALLED.compareAndSet(false, true)) return;
        Context app = context.getApplicationContext();
        Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                persist(app, error);
            } catch (Throwable ignored) { }
            try {
                if (previous != null) previous.uncaughtException(thread, error);
                else {
                    android.os.Process.killProcess(android.os.Process.myPid());
                    System.exit(10);
                }
            } catch (Throwable ignored) {
                android.os.Process.killProcess(android.os.Process.myPid());
                System.exit(10);
            }
        });
    }

    static void schedulePending(Context context) {
        try {
            if (queue(context).pending().isEmpty() || !ensureWorkManager(context)) return;
            Constraints constraints = new Constraints.Builder()
                    .setRequiredNetworkType(NetworkType.CONNECTED)
                    .build();
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(CrashReportWorker.class)
                    .setConstraints(constraints)
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build();
            WorkManager.getInstance(context.getApplicationContext())
                    .enqueueUniqueWork(UNIQUE_UPLOAD, ExistingWorkPolicy.KEEP, request);
        } catch (Throwable ignored) { }
    }

    static boolean ensureWorkManager(Context context) {
        try {
            if (!WorkManager.isInitialized()) {
                WorkManager.initialize(context.getApplicationContext(), new Configuration.Builder().build());
            }
            WorkManager.getInstance(context.getApplicationContext());
            return true;
        } catch (Throwable ignored) {
            return false;
        }
    }

    static CrashQueue queue(Context context) {
        return new CrashQueue(new File(context.getFilesDir(), "crash-reports"));
    }

    private static void persist(Context context, Throwable error) throws Exception {
        Map<String, Object> values = CrashReportPayload.create(
                context.getPackageName(),
                BuildConfig.VERSION_CODE,
                BuildConfig.VERSION_NAME,
                Build.VERSION.SDK_INT,
                Build.MANUFACTURER,
                Build.MODEL,
                error,
                System.currentTimeMillis());
        JSONObject json = new JSONObject();
        for (Map.Entry<String, Object> entry : values.entrySet()) json.put(entry.getKey(), entry.getValue());
        queue(context).enqueue(json.toString());
    }
}
