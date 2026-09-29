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
        JSONObject payload = CrashReporter.handledPayload("download_failed", "x".repeat(5000), new RuntimeException("boom"), 1700000000000L);
        assertEquals("com.apkstore.client", payload.getString("package_id"));
        assertEquals("HandledError.download_failed", payload.getString("exception_class"));
        assertTrue(payload.getString("message").length() <= 2048);
        assertTrue(payload.getString("stack_trace").length() <= 32768);
        assertTrue(payload.getString("fingerprint").matches("[0-9a-f]{64}"));
    }

    @Test public void sanitizerRedactsCommonSensitiveStrings() {
        String safe = CrashReporter.safe(
                "user@example.com https://example.com/path?token=abc Authorization: Bearer secret-token apikey=hello password=world",
                4096);
        assertFalse(safe.contains("user@example.com"));
        assertFalse(safe.contains("https://example.com"));
        assertFalse(safe.contains("secret-token"));
        assertFalse(safe.contains("apikey=hello"));
        assertFalse(safe.contains("password=world"));
    }
}
