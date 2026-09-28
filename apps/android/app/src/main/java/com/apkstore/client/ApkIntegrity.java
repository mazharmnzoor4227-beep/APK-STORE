package com.apkstore.client;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;

import java.io.File;
import java.io.FileInputStream;
import java.security.MessageDigest;

final class ApkIntegrity {
    private ApkIntegrity() {}

    static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] bytes = new byte[65536];
            int count;
            while ((count = input.read(bytes)) != -1) digest.update(bytes, 0, count);
        }
        return hex(digest.digest());
    }

    static void verifyFile(File file, String expectedHash, long expectedSize) throws Exception {
        if (!file.isFile()) throw new SecurityException("APK file is missing. Download again.");
        if (expectedSize <= 0 || file.length() != expectedSize)
            throw new SecurityException("APK size does not match the published release.");
        if (!expectedHash.matches("[a-fA-F0-9]{64}") || !sha256(file).equalsIgnoreCase(expectedHash))
            throw new SecurityException("APK checksum does not match the published release.");
    }

    static void verifyPackage(Context context, File file, String packageId, String certificateHash) throws Exception {
        PackageManager manager = context.getPackageManager();
        PackageInfo archive = manager.getPackageArchiveInfo(file.getAbsolutePath(), PackageManager.GET_SIGNING_CERTIFICATES);
        if (archive == null || !packageId.equals(archive.packageName))
            throw new SecurityException("APK package does not match this listing.");
        String archiveSigner = signerHash(archive);
        if (archiveSigner == null || !archiveSigner.equalsIgnoreCase(certificateHash))
            throw new SecurityException("APK signing certificate does not match the published release.");
        try {
            PackageInfo installed = manager.getPackageInfo(packageId, PackageManager.GET_SIGNING_CERTIFICATES);
            String installedSigner = signerHash(installed);
            if (!archiveSigner.equals(installedSigner))
                throw new SecurityException("The installed app has a different signing certificate. It cannot be updated.");
        } catch (PackageManager.NameNotFoundException ignored) { }
    }

    private static String signerHash(PackageInfo info) throws Exception {
        SigningInfo signing = info.signingInfo;
        if (signing == null) return null;
        Signature[] signatures = signing.hasMultipleSigners() ? signing.getApkContentsSigners() : signing.getSigningCertificateHistory();
        if (signatures == null || signatures.length == 0) return null;
        return hex(MessageDigest.getInstance("SHA-256").digest(signatures[0].toByteArray()));
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
        return result.toString();
    }
}
