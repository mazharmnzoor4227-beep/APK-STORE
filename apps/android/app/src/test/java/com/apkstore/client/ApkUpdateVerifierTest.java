package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

public class ApkUpdateVerifierTest {
    private static final String HASH = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    private static final String SIGNER = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    @Test public void acceptsExactPublishedIdentityAndIntegrityMetadata() {
        ApkUpdateVerifier.Result result = ApkUpdateVerifier.validateMetadata(
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L,
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L);
        assertTrue(result.ok);
        assertEquals("", result.reason);
    }

    @Test public void rejectsSizeMismatch() {
        ApkUpdateVerifier.Result result = ApkUpdateVerifier.validateMetadata(
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 122L,
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L);
        assertFalse(result.ok);
        assertTrue(result.reason.toLowerCase().contains("size"));
    }

    @Test public void rejectsHashMismatch() {
        ApkUpdateVerifier.Result result = ApkUpdateVerifier.validateMetadata(
                StoreIdentity.PACKAGE_ID, SIGNER, "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", 123L,
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L);
        assertFalse(result.ok);
        assertTrue(result.reason.toLowerCase().contains("checksum"));
    }

    @Test public void rejectsPackageMismatch() {
        ApkUpdateVerifier.Result result = ApkUpdateVerifier.validateMetadata(
                "com.example.fake", SIGNER, HASH, 123L,
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L);
        assertFalse(result.ok);
        assertTrue(result.reason.toLowerCase().contains("package"));
    }

    @Test public void rejectsSignerMismatch() {
        ApkUpdateVerifier.Result result = ApkUpdateVerifier.validateMetadata(
                StoreIdentity.PACKAGE_ID, "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", HASH, 123L,
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L);
        assertFalse(result.ok);
        assertTrue(result.reason.toLowerCase().contains("sign"));
    }

    @Test public void failsClosedWhenExpectedSignerIsNotConfigured() {
        ApkUpdateVerifier.Result result = ApkUpdateVerifier.validateMetadata(
                StoreIdentity.PACKAGE_ID, SIGNER, HASH, 123L,
                StoreIdentity.PACKAGE_ID, "", HASH, 123L);
        assertFalse(result.ok);
        assertTrue(result.reason.toLowerCase().contains("signing identity"));
    }
}
