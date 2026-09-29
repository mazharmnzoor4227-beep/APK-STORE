package com.apkstore.client;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

public class AndroidVersionLabelTest {
    @Test public void api23IsAndroid60() {
        assertEquals("Android 6.0+", AndroidVersionLabel.forMinSdk(23));
    }

    @Test public void api26IsAndroid80() {
        assertEquals("Android 8.0+", AndroidVersionLabel.forMinSdk(26));
    }

    @Test public void api29IsAndroid10() {
        assertEquals("Android 10+", AndroidVersionLabel.forMinSdk(29));
    }

    @Test public void api35IsAndroid15() {
        assertEquals("Android 15+", AndroidVersionLabel.forMinSdk(35));
    }

    @Test public void api36IsAndroid16() {
        assertEquals("Android 16+", AndroidVersionLabel.forMinSdk(36));
    }

    @Test public void unknownFutureApiDoesNotPretendToBeAndroidVersion() {
        assertEquals("API 99+", AndroidVersionLabel.forMinSdk(99));
    }

    @Test public void invalidSdkHasNoLabel() {
        assertEquals("", AndroidVersionLabel.forMinSdk(0));
    }
}
