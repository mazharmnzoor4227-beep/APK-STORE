package com.apkstore.client;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class SelfUpdateRepositoryTest {
    private static final String ID = "11111111-1111-4111-8111-111111111111";
    private static final String RID = "22222222-2222-4222-8222-222222222222";

    private JSONObject app(String packageId, String slug) throws Exception {
        return new JSONObject().put("id", ID).put("slug", slug).put("title", "APK STORE")
                .put("package_id", packageId).put("current_release_id", RID);
    }

    private JSONObject release() throws Exception {
        return new JSONObject().put("id", RID).put("version_code", 14).put("version_name", "1.1.6")
                .put("byte_size", 12345).put("apk_sha256", "a".repeat(64))
                .put("certificate_sha256", "b".repeat(64)).put("release_notes", "Fixes");
    }

    @Test public void parsesOnlyPermanentStoreIdentity() throws Exception {
        SelfUpdateRepository.UpdateInfo info = SelfUpdateRepository.parse(app("com.apkstore.client", "apk-store"), release());
        assertEquals("com.apkstore.client", info.packageId);
        assertEquals("apk-store", info.slug);
        assertEquals(14, info.versionCode);
        assertEquals("Fixes", info.releaseNotes);
    }

    @Test public void rejectsWrongPackageOrSlug() throws Exception {
        assertThrows(Exception.class, () -> SelfUpdateRepository.parse(app("bad.package", "apk-store"), release()));
        assertThrows(Exception.class, () -> SelfUpdateRepository.parse(app("com.apkstore.client", "other"), release()));
    }

    @Test public void rejectsMismatchedReleaseIdentityAndMalformedSecurityFields() throws Exception {
        JSONObject wrong = release().put("id", "33333333-3333-4333-8333-333333333333");
        assertThrows(Exception.class, () -> SelfUpdateRepository.parse(app("com.apkstore.client", "apk-store"), wrong));
        JSONObject badHash = release().put("apk_sha256", "bad");
        assertThrows(Exception.class, () -> SelfUpdateRepository.parse(app("com.apkstore.client", "apk-store"), badHash));
        JSONObject badSigner = release().put("certificate_sha256", "bad");
        assertThrows(Exception.class, () -> SelfUpdateRepository.parse(app("com.apkstore.client", "apk-store"), badSigner));
    }

    @Test public void updateDecisionUsesIntegerVersionCode() {
        assertTrue(StoreUpdatePolicy.isUpdateAvailable(13, 14));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(14, 14));
        assertFalse(StoreUpdatePolicy.isUpdateAvailable(15, 14));
    }
}
