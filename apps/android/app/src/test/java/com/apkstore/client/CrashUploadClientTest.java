package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

public class CrashUploadClientTest {
    @Test public void classifiesAcknowledgedDiscardedAndRetryableStatuses() {
        assertEquals(CrashUploadClient.Outcome.ACKNOWLEDGE, CrashUploadClient.classifyStatus(202));
        assertEquals(CrashUploadClient.Outcome.DISCARD, CrashUploadClient.classifyStatus(400));
        assertEquals(CrashUploadClient.Outcome.DISCARD, CrashUploadClient.classifyStatus(413));
        assertEquals(CrashUploadClient.Outcome.RETRY, CrashUploadClient.classifyStatus(429));
        assertEquals(CrashUploadClient.Outcome.RETRY, CrashUploadClient.classifyStatus(500));
    }

    @Test public void validatesOnlyBoundedLocalCrashJson() {
        String valid = "{\"fingerprint\":\"" + "a".repeat(64) + "\",\"package_id\":\"com.apkstore.client\",\"version_code\":13,\"version_name\":\"1.1.5\",\"exception_class\":\"java.lang.RuntimeException\",\"stack_trace\":\"trace\",\"occurred_at\":\"2026-09-29T07:30:00Z\"}";
        assertTrue(CrashUploadClient.locallyValid(valid.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertFalse(CrashUploadClient.locallyValid("not-json".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        assertFalse(CrashUploadClient.locallyValid(valid.replace("com.apkstore.client", "bad.package").getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
}
