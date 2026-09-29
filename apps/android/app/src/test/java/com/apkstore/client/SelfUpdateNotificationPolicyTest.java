package com.apkstore.client;

import static org.junit.Assert.*;
import org.junit.Test;

public class SelfUpdateNotificationPolicyTest {
    @Test public void notifiesOnlyForTrustedNewerReleaseWhenEnabled() {
        assertTrue(SelfUpdateNotificationPolicy.shouldNotify(13, 14, true, true));
        assertFalse(SelfUpdateNotificationPolicy.shouldNotify(13, 13, true, true));
        assertFalse(SelfUpdateNotificationPolicy.shouldNotify(13, 14, false, true));
        assertFalse(SelfUpdateNotificationPolicy.shouldNotify(13, 14, true, false));
    }

    @Test public void deduplicatesSameRemoteVersion() {
        assertTrue(SelfUpdateNotificationPolicy.isNewNotification(14, 13));
        assertFalse(SelfUpdateNotificationPolicy.isNewNotification(14, 14));
        assertFalse(SelfUpdateNotificationPolicy.isNewNotification(13, 14));
    }
}
