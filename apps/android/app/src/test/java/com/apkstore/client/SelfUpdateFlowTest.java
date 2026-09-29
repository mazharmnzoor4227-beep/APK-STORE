package com.apkstore.client;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class SelfUpdateFlowTest {
    private Path projectFile(String relative) {
        Path module = Paths.get(relative);
        if (Files.exists(module)) return module;
        return Paths.get("app").resolve(relative);
    }

    private String read(Path path) throws Exception {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    @Test public void apkStoreClientIsNotShownInPublicCatalog() {
        assertFalse(CatalogPolicy.shouldList("apk-store-client", "com.apkstore.client"));
        assertFalse(CatalogPolicy.shouldList("anything", "com.apkstore.client"));
        assertTrue(CatalogPolicy.shouldList("black-hole", "com.blackhole.app"));
    }

    @Test public void selfUpdateUsesFreshReleaseMetadataInsteadOfCatalogCache() throws Exception {
        String java = read(projectFile("src/main/java/com/apkstore/client/MainActivity.java"));
        assertTrue("Self update must retain the freshly fetched release metadata",
                java.contains("selfUpdateApp = self"));
        assertTrue("Self update installer must resolve its own fresh metadata before catalog cache",
                java.contains("if (selfUpdateApp != null && slug.equals(selfUpdateApp.optString(\"slug\"))) return selfUpdateApp;"));
        assertTrue("Update button must start the dedicated self-update flow",
                java.contains("startSelfUpdate(self)"));
    }

    @Test public void selfUpdatePageShowsProgressUntilAndroidInstallerOpens() throws Exception {
        String java = read(projectFile("src/main/java/com/apkstore/client/MainActivity.java"));
        assertTrue(java.contains("Downloading update"));
        assertTrue(java.contains("Installing update"));
        assertTrue(java.contains("selfUpdateUiPoll"));
    }
}
