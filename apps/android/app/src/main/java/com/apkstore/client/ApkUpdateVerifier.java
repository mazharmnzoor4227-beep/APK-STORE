package com.apkstore.client;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;

import java.io.File;
import java.security.MessageDigest;
import java.util.Locale;

final class ApkUpdateVerifier {
    static final class Result {
        final boolean ok;
        final String reason;

        Result(boolean ok, String reason) {
            this.ok = ok;
            this.reason = reason == null ? "" : reason;
        }

        static Result ok() { return new Result(true, ""); }
        static Result fail(String reason) { return new Result(false, reason); }
    }

    private ApkUpdateVerifier() {}

    static Result validateMetadata(
            String actualPackage, String actualSigner, String actualHash, long actualSize,
            String expectedPackage, String expectedSigner, String expectedHash, long expectedSize) {
        if (expectedPackage == null || expectedPackage.isEmpty())
            return Result.fail("Expected package identity is missing.");
        if (!expectedPackage.equals(actualPackage))
            return Result.fail("APK package does not match APK STORE.");
        String wantedSigner = normalizeHex(expectedSigner);
        if (wantedSigner.length() != 64)
            return Result.fail("Permanent signing identity is not configured.");
        if (!wantedSigner.equals(normalizeHex(actualSigner)))
            return Result.fail("APK signing certificate does not match APK STORE.");
        if (expectedSize <= 0 || actualSize != expectedSize)
            return Result.fail("APK size does not match the published release.");
        String wantedHash = normalizeHex(expectedHash);
        if (wantedHash.length() != 64 || !wantedHash.equals(normalizeHex(actualHash)))
            return Result.fail("APK checksum does not match the published release.");
        return Result.ok();
    }

    static Result verify(Context context, File apk, String expectedSha256, long expectedSize) {
        try {
            if (apk == null || !apk.isFile()) return Result.fail("Downloaded APK file is missing.");
            PackageManager pm = context.getPackageManager();
            PackageInfo info;
            if (Build.VERSION.SDK_INT >= 28) {
                info = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
            } else {
                info = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.GET_SIGNATURES);
            }
            if (info == null || info.packageName == null)
                return Result.fail("Downloaded file is not a readable APK.");

            Signature[] signers = null;
            if (Build.VERSION.SDK_INT >= 28 && info.signingInfo != null) {
                signers = info.signingInfo.getApkContentsSigners();
            } else if (Build.VERSION.SDK_INT < 28) {
                signers = info.signatures;
            }
            if (signers == null || signers.length != 1)
                return Result.fail("APK signing certificate is missing or ambiguous.");

            String actualSigner = sha256(signers[0].toByteArray());
            String actualHash = ApkIntegrity.sha256(apk);
            return validateMetadata(
                    info.packageName, actualSigner, actualHash, apk.length(),
                    StoreIdentity.PACKAGE_ID, BuildConfig.APK_STORE_SIGNER_SHA256,
                    expectedSha256, expectedSize);
        } catch (Exception error) {
            String message = error.getMessage();
            return Result.fail(message == null || message.trim().isEmpty()
                    ? "APK STORE update verification failed."
                    : "APK STORE update verification failed: " + message);
        }
    }

    private static String sha256(byte[] value) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(value);
        StringBuilder result = new StringBuilder(digest.length * 2);
        for (byte b : digest) result.append(String.format(Locale.ROOT, "%02x", b & 255));
        return result.toString();
    }

    private static String normalizeHex(String value) {
        if (value == null) return "";
        return value.replace(":", "").replace(" ", "").trim().toLowerCase(Locale.ROOT);
    }
}
