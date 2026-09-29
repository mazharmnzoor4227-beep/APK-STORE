package com.apkstore.client;

final class StoreIdentity {
    static final String PACKAGE_ID = "com.apkstore.client";
    static final String CATALOG_SLUG = "apk-store";

    private StoreIdentity() {}

    static boolean isStoreListing(String packageId, String slug) {
        return PACKAGE_ID.equals(packageId) && CATALOG_SLUG.equals(slug);
    }
}
