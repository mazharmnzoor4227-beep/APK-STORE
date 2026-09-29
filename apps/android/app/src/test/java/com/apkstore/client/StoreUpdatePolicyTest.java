package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

public class StoreUpdatePolicyTest {
    @Test public void permanentIdentityIsStable() {
        assertEquals("com.apkstore.client", StoreIdentity.PACKAGE_ID);
        assertEquals("apk-store", StoreIdentity.CATALOG_SLUG);
    }

    @Test public void updateRequiresStrictlyHigherIntegerVersionCode() {
        assertTrue(StoreUpdatePolicy.isUpdateAvailable(13, 14));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(13, 13));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(13, 12));
    }
}
