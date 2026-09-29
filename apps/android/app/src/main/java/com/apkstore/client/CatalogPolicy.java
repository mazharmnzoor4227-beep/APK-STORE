package com.apkstore.client;

final class CatalogPolicy {
    private CatalogPolicy() {}

    static boolean shouldList(String slug, String packageId) {
        return !"apk-store-client".equals(slug) && !"com.apkstore.client".equals(packageId);
    }
}
