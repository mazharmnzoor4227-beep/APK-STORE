package com.apkstore.client;

import android.app.Application;

public final class ApkStoreApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        CrashReporter.install(this);
        CrashReporter.schedulePending(this);
        createUpdateChannel();
    }
    private void createUpdateChannel() {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 26) {
                android.app.NotificationChannel channel = new android.app.NotificationChannel(
                        UpdateCheckWorker.CHANNEL_ID, "App updates",
                        android.app.NotificationManager.IMPORTANCE_DEFAULT);
                channel.setDescription("Alerts when an installed app has a new update");
                getSystemService(android.app.NotificationManager.class).createNotificationChannel(channel);
            }
        } catch (Throwable ignored) { }
    }
}
