package com.apkstore.client;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class UninstallFlowTest {
    private Path projectFile(String relative) {
        Path module = Paths.get(relative);
        if (Files.exists(module)) return module;
        return Paths.get("app").resolve(relative);
    }

    private String read(String relative) throws Exception {
        return new String(Files.readAllBytes(projectFile(relative)), StandardCharsets.UTF_8);
    }

    @Test public void uninstallLaunchesAndroidConfirmationWhenUserActionIsRequired() throws Exception {
        String receiver = read("src/main/java/com/apkstore/client/UninstallResultReceiver.java");
        assertTrue("PackageInstaller uninstall must handle the pending-user-action callback",
                receiver.contains("PackageInstaller.STATUS_PENDING_USER_ACTION"));
        assertTrue("Pending uninstall must launch Android's confirmation intent",
                receiver.contains("Intent.EXTRA_INTENT") && receiver.contains("context.startActivity(approval)"));
    }

    @Test public void uninstallStatusReceiverAllowsAndroidToFillResultExtras() throws Exception {
        String activity = read("src/main/java/com/apkstore/client/MainActivity.java");
        assertTrue("PackageInstaller status receiver must be mutable so Android can supply status/user-action extras",
                activity.contains("PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_MUTABLE"));
        assertFalse("The uninstall status receiver must not be immutable",
                activity.contains("PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE"));
    }
}
