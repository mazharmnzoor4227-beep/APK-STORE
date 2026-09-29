package com.apkstore.client;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class MediaUrlPolicyTest {
    private static final String SUPABASE = "https://qfbfxencwsgryoczkdyj.supabase.co";

    @Test public void acceptsStoreMediaBuckets() {
        assertTrue(MediaUrlPolicy.trusted(SUPABASE + "/storage/v1/object/public/app-screenshots/admin/a.webp", SUPABASE));
        assertTrue(MediaUrlPolicy.trusted(SUPABASE + "/storage/v1/object/public/app-icons/a.webp", SUPABASE));
    }

    @Test public void acceptsFdroidPhoneScreenshotsOnly() {
        assertTrue(MediaUrlPolicy.trusted("https://f-droid.org/repo/com.amaze.filemanager/en-US/phoneScreenshots/1.png", SUPABASE));
        assertFalse(MediaUrlPolicy.trusted("https://f-droid.org/about", SUPABASE));
    }

    @Test public void acceptsRawGithubImageAssets() {
        assertTrue(MediaUrlPolicy.trusted("https://raw.githubusercontent.com/ImranR98/Obtainium/v1.6.17/assets/screenshots/1.apps.png", SUPABASE));
        assertFalse(MediaUrlPolicy.trusted("https://raw.githubusercontent.com/acme/app/main/README.md", SUPABASE));
    }

    @Test public void rejectsHttpCredentialsAndArbitraryHosts() {
        assertFalse(MediaUrlPolicy.trusted("http://f-droid.org/repo/app/phoneScreenshots/1.png", SUPABASE));
        assertFalse(MediaUrlPolicy.trusted("https://user:pass@f-droid.org/repo/app/phoneScreenshots/1.png", SUPABASE));
        assertFalse(MediaUrlPolicy.trusted("https://example.com/image.png", SUPABASE));
    }
}
