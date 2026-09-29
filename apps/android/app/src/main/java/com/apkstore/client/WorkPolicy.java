package com.apkstore.client;

final class WorkPolicy {
    private WorkPolicy() {}

    static int normalizeUpdateHours(int value) {
        return value == 6 || value == 12 ? value : 12;
    }
}
