package com.apkstore.client;

import android.content.Context;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

public class CrashReporterContractTest {
    @Test public void exposesDeferredUploadContractUsedByApplicationAndWorker() throws Exception {
        assertNotNull(CrashReporter.class.getDeclaredMethod("enqueuePending", Context.class));
        assertNotNull(CrashReporter.class.getDeclaredMethod("pendingFile", Context.class));
    }

    @Test public void usesPermanentProductionSignerFingerprint() {
        assertEquals(
                "cd5fff73675c8c783db51a3300cc06845763215d2c7b03a64ae7f9b589360585",
                CrashReporter.SIGNER_SHA256);
    }
}
