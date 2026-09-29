package com.apkstore.client;
import static org.junit.Assert.*;
import org.junit.Test;
import org.json.JSONObject;
public class CrashReporterTest {
 @Test public void payloadIsBoundedAndFingerprinted() throws Exception {
   RuntimeException e = new RuntimeException("x".repeat(5000));
   JSONObject p = CrashReporter.payload(e, 1_700_000_000_000L);
   assertEquals("com.apkstore.client", p.getString("package_id"));
   assertTrue(p.getString("message").length() <= 2048);
   assertTrue(p.getString("stack_trace").length() <= 32768);
   assertTrue(p.getString("fingerprint").matches("[0-9a-f]{64}"));
 }
 @Test public void fingerprintIsStableForSameCrash() throws Exception {
   RuntimeException e = new RuntimeException("same");
   assertEquals(CrashReporter.payload(e, 1).getString("fingerprint"), CrashReporter.payload(e, 2).getString("fingerprint"));
 }
}
