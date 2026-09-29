package com.apkstore.client;

final class SelfUpdateNotificationPolicy {
    private SelfUpdateNotificationPolicy() {}

    static boolean shouldNotify(long installedVersionCode, long remoteVersionCode,
                                boolean enabled, boolean trustedMetadata) {
        return enabled && trustedMetadata && installedVersionCode >= 0
                && remoteVersionCode > installedVersionCode;
    }

    static boolean isNewNotification(long remoteVersionCode, long lastNotifiedVersionCode) {
        return remoteVersionCode > 0 && remoteVersionCode > lastNotifiedVersionCode;
    }
}
