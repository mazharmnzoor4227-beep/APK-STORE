package com.apkstore.client;

import static org.junit.Assert.*;

import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.Test;

public class CrashReporterTest {
    private static Throwable sample(String message) {
        IllegalStateException error = new IllegalStateException(message);
        error.setStackTrace(new StackTraceElement[]{
                new StackTraceElement("com.apkstore.client.MainActivity", "onCreate", "MainActivity.java", 150),
                new StackTraceElement("android.app.Activity", "performCreate", "Activity.java", 9000)
        });
        return error;
    }

    @Test public void payloadUsesExactEdgeSchemaAndRedactsSensitiveText() {
        Map<String, Object> payload = CrashReportPayload.create(
                "com.apkstore.client", 15, "1.1.7", 36,
                "INFINIX", "X6885",
                sample("token=abc123 user@example.com https://example.com/private"),
                1790710000000L);

        Set<String> expected = new HashSet<>(Arrays.asList(
                "fingerprint", "package_id", "version_code", "version_name", "android_sdk",
                "device_manufacturer", "device_model", "exception_class", "message",
                "stack_trace", "occurred_at"));
        assertEquals(expected, payload.keySet());
        assertEquals("com.apkstore.client", payload.get("package_id"));
        assertEquals(15L, payload.get("version_code"));
        assertEquals("1.1.7", payload.get("version_name"));
        assertEquals(36, payload.get("android_sdk"));
        assertTrue(String.valueOf(payload.get("fingerprint")).matches("[0-9a-f]{64}"));
        String message = String.valueOf(payload.get("message"));
        assertFalse(message.contains("abc123"));
        assertFalse(message.contains("user@example.com"));
        assertFalse(message.contains("example.com"));
        assertTrue(message.contains("[redacted]"));
        assertTrue(message.contains("[email]"));
        assertTrue(message.contains("[url]"));
        assertFalse(payload.containsKey("screen"));
        assertFalse(payload.containsKey("app_version"));
        assertFalse(payload.containsKey("android_version"));
        assertFalse(payload.containsKey("stack"));
    }

    @Test public void fingerprintGroupsSameCrashIndependentOfMessage() {
        String first = CrashReportPayload.fingerprint(sample("first message"));
        String second = CrashReportPayload.fingerprint(sample("different message"));
        assertEquals(first, second);
    }

    @Test public void queuePersistsUntilExplicitlyDeleted() throws Exception {
        File root = Files.createTempDirectory("apkstore-crash-test").toFile();
        CrashQueue queue = new CrashQueue(root);
        File stored = queue.enqueue("{\"fingerprint\":\"abc\"}");

        List<File> pending = queue.pending();
        assertEquals(1, pending.size());
        assertEquals(stored.getCanonicalPath(), pending.get(0).getCanonicalPath());
        assertEquals("{\"fingerprint\":\"abc\"}", queue.read(stored));
        assertTrue(stored.exists());

        queue.delete(stored);
        assertFalse(stored.exists());
        assertTrue(queue.pending().isEmpty());
    }
}
