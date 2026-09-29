package com.apkstore.client;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class WorkManagerPolicyTest {
    @Test public void onlySupportedIntervalsReachPeriodicWorkManager() {
        assertEquals(6, WorkPolicy.normalizeUpdateHours(6));
        assertEquals(12, WorkPolicy.normalizeUpdateHours(12));
        assertEquals(12, WorkPolicy.normalizeUpdateHours(0));
        assertEquals(12, WorkPolicy.normalizeUpdateHours(-1));
        assertEquals(12, WorkPolicy.normalizeUpdateHours(24));
    }
}
