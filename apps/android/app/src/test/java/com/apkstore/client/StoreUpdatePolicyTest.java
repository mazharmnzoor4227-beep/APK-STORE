package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

public class StoreUpdatePolicyTest {
    private static final String CERT = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    private static final String HASH = "abcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd";

    @Test public void permanentIdentityIsStable() {
        assertEquals("com.apkstore.client", StoreIdentity.PACKAGE_ID);
        assertEquals("apk-store", StoreIdentity.CATALOG_SLUG);
        assertTrue(StoreIdentity.isStoreListing("com.apkstore.client", "apk-store"));
        assertFalse(StoreIdentity.isStoreListing("com.other.app", "apk-store"));
    }

    @Test public void updateRequiresStrictlyHigherIntegerVersionCode() {
        assertTrue(StoreUpdatePolicy.isUpdateAvailable(13, 14));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(13, 13));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(13, 12));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(-1, 14));
    }

    @Test public void metadataFailsClosed() {
        assertNull(StoreUpdatePolicy.validateMetadata("com.apkstore.client", "apk-store", 13, 14, HASH, 1234, CERT, CERT));
        assertNotNull(StoreUpdatePolicy.validateMetadata("bad.package", "apk-store", 13, 14, HASH, 1234, CERT, CERT));
        assertNotNull(StoreUpdatePolicy.validateMetadata("com.apkstore.client", "apk-store", 14, 14, HASH, 1234, CERT, CERT));
        assertNotNull(StoreUpdatePolicy.validateMetadata("com.apkstore.client", "apk-store", 13, 14, "bad", 1234, CERT, CERT));
        assertNotNull(StoreUpdatePolicy.validateMetadata("com.apkstore.client", "apk-store", 13, 14, HASH, 0, CERT, CERT));
        assertNotNull(StoreUpdatePolicy.validateMetadata("com.apkstore.client", "apk-store", 13, 14, HASH, 1234, CERT, ""));
        assertNotNull(StoreUpdatePolicy.validateMetadata("com.apkstore.client", "apk-store", 13, 14, HASH, 1234, "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff", CERT));
    }

    @Test public void fingerprintNormalizationAcceptsColonSeparatedUppercase() {
        String colon = CERT.toUpperCase().replaceAll("(..)(?!$)", "$1:");
        assertEquals(CERT, StoreUpdatePolicy.normalizeFingerprint(colon));
    }
}
