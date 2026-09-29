package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;
import java.util.Arrays;

public class BulkUpdateQueueTest {
    @Test public void onlyOneUpdateIsActiveAtATime() {
        BulkUpdateQueue queue = new BulkUpdateQueue();
        queue.reset(Arrays.asList("one", "two", "three"));
        assertEquals("one", queue.startNext());
        assertNull(queue.startNext());
        queue.complete("one");
        assertEquals("two", queue.startNext());
        queue.complete("two");
        assertEquals("three", queue.startNext());
        queue.complete("three");
        assertNull(queue.startNext());
        assertTrue(queue.isIdle());
    }

    @Test public void wrongCompletionCannotAdvanceQueue() {
        BulkUpdateQueue queue = new BulkUpdateQueue();
        queue.reset(Arrays.asList("one", "two"));
        assertEquals("one", queue.startNext());
        queue.complete("other");
        assertNull(queue.startNext());
        queue.complete("one");
        assertEquals("two", queue.startNext());
    }

    @Test public void resetDropsDuplicatesAndBlankSlugs() {
        BulkUpdateQueue queue = new BulkUpdateQueue();
        queue.reset(Arrays.asList("one", "", "one", null, "two"));
        assertEquals("one", queue.startNext());
        queue.complete("one");
        assertEquals("two", queue.startNext());
    }
}
