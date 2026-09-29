package com.apkstore.client;

final class StoreUpdatePolicy {
    private StoreUpdatePolicy() {}

    static boolean isUpdateAvailable(long installedVersionCode, long remoteVersionCode) {
        return installedVersionCode >= 0 && remoteVersionCode > installedVersionCode;
    }

    static String validateMetadata(String packageId, String slug, long installedVersionCode,
                                   long remoteVersionCode, String sha256, long byteSize,
                                   String certificateSha256, String expectedCertificateSha256) {
        if (!StoreIdentity.isStoreListing(packageId, slug)) return "Update metadata does not belong to APK STORE.";
        if (!isUpdateAvailable(installedVersionCode, remoteVersionCode)) return "APK STORE is already up to date.";
        if (sha256 == null || !sha256.matches("(?i)[0-9a-f]{64}")) return "Update checksum is missing or invalid.";
        if (byteSize <= 0) return "Update file size is invalid.";
        if (expectedCertificateSha256 == null || expectedCertificateSha256.isBlank())
            return "APK STORE release signer is not configured.";
        String actual = normalizeFingerprint(certificateSha256);
        String expected = normalizeFingerprint(expectedCertificateSha256);
        if (actual.length() != 64 || !actual.equals(expected)) return "Update signing certificate does not match APK STORE.";
        return null;
    }

    static String normalizeFingerprint(String value) {
        return value == null ? "" : value.replace(":", "").replace(" ", "").trim().toLowerCase(java.util.Locale.ROOT);
    }
}
