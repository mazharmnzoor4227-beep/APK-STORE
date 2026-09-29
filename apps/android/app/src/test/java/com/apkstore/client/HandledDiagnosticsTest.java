package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONObject;

public class HandledDiagnosticsTest {
    @Test public void handledFingerprintSeparatesCategories() throws Exception {
        RuntimeException error = new RuntimeException("network failed");
        String download = CrashFingerprint.ofHandled("download_failed", error);
        String install = CrashFingerprint.ofHandled("install_failed", error);
        assertTrue(download.matches("[0-9a-f]{64}"));
        assertNotEquals(download, install);
        assertEquals(download, CrashFingerprint.ofHandled("download_failed", error));
    }

    @Test public void handledPayloadUsesSameBoundedPrivatePipeline() throws Exception {
        JSONObject payload = CrashReporter.handledPayload("download_failed", "x".repeat(3000), new RuntimeException("boom"), 1700000000000L);
        assertEquals("com.apkstore.client", payload.getString("package_id"));
        assertEquals("HandledError.download_failed", payload.getString("exception_class"));
        assertTrue(payload.getString("message").length() <= 1000);
        assertTrue(payload.getString("stack_trace").length() <= 16000);
        assertTrue(payload.getString("fingerprint").matches("[0-9a-f]{64}"));
    }
}
