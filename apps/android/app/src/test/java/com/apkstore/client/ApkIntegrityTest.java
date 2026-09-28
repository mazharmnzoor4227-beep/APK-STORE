package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

public class ApkIntegrityTest {
    @Test public void validatesHashAndSize() throws Exception {
        File apk = File.createTempFile("apk-test", ".apk");
        try {
            Files.write(apk.toPath(), "abc".getBytes(StandardCharsets.UTF_8));
            ApkIntegrity.verifyFile(apk, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", 3);
            assertThrows(SecurityException.class, () -> ApkIntegrity.verifyFile(apk, "0".repeat(64), 3));
            assertThrows(SecurityException.class, () -> ApkIntegrity.verifyFile(apk, ApkIntegrity.sha256(apk), 4));
        } finally { apk.delete(); }
    }
}
