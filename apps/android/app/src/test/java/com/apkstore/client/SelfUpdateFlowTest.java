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

    private Path findUp(String... segments) {
        Path dir = Paths.get("").toAbsolutePath();
        for (int depth = 0; depth < 8 && dir != null; depth++, dir = dir.getParent()) {
            Path candidate = dir;
            for (String segment : segments) candidate = candidate.resolve(segment);
            if (Files.exists(candidate)) return candidate;
        }
        throw new IllegalStateException("Repository file not found: " + String.join("/", segments));
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
        assertTrue("Self update check must fetch APK hash for integrity verification",
                java.contains("apk_sha256,byte_size,certificate_sha256"));
        assertTrue("Download completion must resolve self update metadata through appForDownload",
                java.contains("JSONObject app = appForDownload(slug);"));
    }

    @Test public void selfUpdatePageShowsProgressUntilAndroidInstallerOpens() throws Exception {
        String java = read(projectFile("src/main/java/com/apkstore/client/MainActivity.java"));
        assertTrue(java.contains("Downloading update"));
        assertTrue(java.contains("Installing update"));
        assertTrue(java.contains("selfUpdateUiPoll"));
        assertTrue(java.contains("consumeInstallResult(selfUpdateApp.optString(\"slug\"))"));
    }

    @Test public void cancelledSelfUpdateCanBeRetried() throws Exception {
        String java = read(projectFile("src/main/java/com/apkstore/client/MainActivity.java"));
        assertTrue(java.contains("if (selfUpdateApp != null && slug.equals(selfUpdateApp.optString(\"slug\")))"));
        assertTrue(java.contains("completedDownloads.remove(slug);"));
        assertTrue(java.contains("Retry update"));
    }

    @Test public void stalledDownloadsAreDetectedRetriedAndCancelable() throws Exception {
        String java = read(projectFile("src/main/java/com/apkstore/client/MainActivity.java"));
        assertTrue("Track byte progress so a frozen DownloadManager request can be detected", java.contains("downloadLastBytes"));
        assertTrue("Track the last time bytes advanced", java.contains("downloadLastProgressAt"));
        assertTrue("Bound automatic retries instead of looping forever", java.contains("downloadStallRetries"));
        assertTrue("A stalled request must be recovered through a dedicated path", java.contains("handleStalledDownload(slug)"));
        assertTrue("Stall detection should wait 45 seconds before recovery", java.contains("now - lastAt > 45000"));
        assertTrue("Manual cancellation must clear scheduled stall retry state", java.contains("downloadStallRetries.remove(slug);"));
        assertTrue("Self-update UI must refresh while retry recovery happens", java.contains("refreshDetail(); updateSelfUpdateUi();"));
    }

    @Test public void releaseIdentityIsDerivedFromGradleInCi() throws Exception {
        String ci = read(findUp(".github", "workflows", "build-android.yml"));
        assertTrue("CI must read the release version from the Android build file",
                ci.contains("GRADLE_FILE=\"apps/android/app/build.gradle\""));
        assertTrue("CI must derive versionName instead of pinning one release",
                ci.contains("EXPECTED_VERSION_NAME=\"$(sed -nE"));
        assertTrue("CI must derive versionCode instead of pinning one release",
                ci.contains("EXPECTED_VERSION_CODE=\"$(sed -nE"));
        assertTrue("Signed APK versionCode must be verified against the derived value",
                ci.contains("versionCode='$EXPECTED_VERSION_CODE'"));
        assertTrue("Signed APK versionName must be verified against the derived value",
                ci.contains("versionName='$EXPECTED_VERSION_NAME'"));
        assertFalse("CI must not be tied to the old v1.1.9 release",
                ci.contains("EXPECTED_VERSION_NAME: 1.1.9"));
        assertFalse("CI must not be tied to the old versionCode 17 release",
                ci.contains("EXPECTED_VERSION_CODE: '17'"));
    }
}
