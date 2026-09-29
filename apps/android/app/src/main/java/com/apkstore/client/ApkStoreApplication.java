package com.apkstore.client;

import android.app.Application;

public final class ApkStoreApplication extends Application {
    @Override public void onCreate() {
        super.onCreate();
        CrashReporter.install(this);
        CrashReporter.schedulePending(this);
    }
}
