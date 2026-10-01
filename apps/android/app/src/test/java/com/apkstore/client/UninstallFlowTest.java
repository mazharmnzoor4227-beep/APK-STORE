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

    @Test public void uninstallUsesAndroidSystemDeleteConfirmation() throws Exception {
        String activity = read("src/main/java/com/apkstore/client/MainActivity.java");
        String manifest = read("src/main/AndroidManifest.xml");

        assertTrue("Uninstall must delegate to Android's ACTION_DELETE confirmation UI",
                activity.contains("Intent.ACTION_DELETE") && activity.contains("Uri.parse(\"package:\" + pkg)"));
        assertTrue("Uninstall must verify the system uninstaller resolves before launching it",
                activity.contains("resolveActivity(getPackageManager())"));
        assertFalse("REQUEST_DELETE_PACKAGES must stay absent so the PackageInstaller attempt cannot swallow the public ACTION_DELETE flow",
                manifest.contains("android.permission.REQUEST_DELETE_PACKAGES"));
    }
}
