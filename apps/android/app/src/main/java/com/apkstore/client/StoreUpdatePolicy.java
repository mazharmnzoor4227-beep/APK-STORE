package com.apkstore.client;

final class StoreUpdatePolicy {
    private StoreUpdatePolicy() {}

    static boolean isUpdateAvailable(long installedVersionCode, long remoteVersionCode) {
        return remoteVersionCode > installedVersionCode;
    }
}
