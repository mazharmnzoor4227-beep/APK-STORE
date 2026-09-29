package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

import java.io.File;
import java.nio.file.Files;

public class CrashQueueTest {
    @Test public void evictsOldestWhenCountIsBounded() throws Exception {
        File root = Files.createTempDirectory("crash-queue").toFile();
        CrashQueue queue = new CrashQueue(root, 2, 100000);
        assertTrue(queue.enqueue("{\"n\":1}", 1));
        Thread.sleep(2);
        assertTrue(queue.enqueue("{\"n\":2}", 2));
        Thread.sleep(2);
        assertTrue(queue.enqueue("{\"n\":3}", 3));
        assertEquals(2, queue.pending().size());
    }

    @Test public void productionQueueKeepsAtMostTenReports() throws Exception {
        File root = Files.createTempDirectory("crash-queue-ten").toFile();
        CrashQueue queue = new CrashQueue(root, CrashQueue.MAX_REPORTS, CrashQueue.MAX_TOTAL_BYTES);
        for (int i = 0; i < 12; i++) {
            assertTrue(queue.enqueue("{\"n\":" + i + "}", System.currentTimeMillis() + i));
            Thread.sleep(2);
        }
        assertEquals(10, queue.pending().size());
    }

    @Test public void rejectsSingleOversizedReport() throws Exception {
        File root = Files.createTempDirectory("crash-queue-size").toFile();
        CrashQueue queue = new CrashQueue(root, CrashQueue.MAX_REPORTS, CrashQueue.MAX_TOTAL_BYTES);
        assertFalse(queue.enqueue("x".repeat((int)CrashQueue.MAX_REPORT_BYTES + 1), 1));
        assertTrue(queue.pending().isEmpty());
    }

    @Test public void evictsToTotalByteBudget() throws Exception {
        File root = Files.createTempDirectory("crash-queue-budget").toFile();
        CrashQueue queue = new CrashQueue(root, 8, 20);
        queue.enqueue("1234567890", 1);
        Thread.sleep(2);
        queue.enqueue("abcdefghij", 2);
        Thread.sleep(2);
        queue.enqueue("ABCDEFGHIJ", 3);
        assertEquals(2, queue.pending().size());
    }

    @Test public void removesReportsOlderThanThirtyDays() throws Exception {
        File root = Files.createTempDirectory("crash-queue-age").toFile();
        CrashQueue queue = new CrashQueue(root, CrashQueue.MAX_REPORTS, CrashQueue.MAX_TOTAL_BYTES);
        assertTrue(queue.enqueue("{\"old\":true}", 1));
        File old = queue.pending().get(0);
        assertTrue(old.setLastModified(System.currentTimeMillis() - CrashQueue.MAX_AGE_MS - 1000));
        assertTrue(queue.pending().isEmpty());
    }
}
