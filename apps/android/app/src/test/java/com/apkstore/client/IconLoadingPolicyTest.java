package com.apkstore.client;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.Assert.assertTrue;

public class IconLoadingPolicyTest {
    private Path projectFile(String relative) {
        Path module = Paths.get(relative);
        if (Files.exists(module)) return module;
        return Paths.get("app").resolve(relative);
    }

    private String read(Path path) throws Exception {
        return new String(Files.readAllBytes(path), StandardCharsets.UTF_8);
    }

    @Test
    public void catalogIconLoaderAcceptsHttpsIconUrls() throws Exception {
        Path source = projectFile("src/main/java/com/apkstore/client/MainActivity.java");
        assertTrue("MainActivity source must exist", Files.exists(source));
        String java = read(source);
        assertTrue("HTTPS catalog icons are currently rejected unless they match old hard-coded hosts",
                java.contains("if (!url.startsWith(\"https://\")) return fallback;"));
    }

    @Test
    public void launcherUsesAdaptiveIconForSupportedMinSdk() throws Exception {
        Path buildGradle = projectFile("build.gradle");
        assertTrue("Android module build.gradle must exist", Files.isRegularFile(buildGradle));
        String gradle = read(buildGradle);
        assertTrue("Adaptive-only launcher resources require minSdk 26 or newer",
                gradle.contains("minSdk 26"));

        Path adaptive = projectFile("src/main/res/mipmap-anydpi-v26/ic_launcher.xml");
        assertTrue("Adaptive launcher icon must exist", Files.isRegularFile(adaptive));
    }

    @Test
    public void adaptiveLauncherUsesSuppliedStoreArtwork() throws Exception {
        Path adaptive = projectFile("src/main/res/mipmap-anydpi-v26/ic_launcher.xml");
        assertTrue("Adaptive icon XML must exist", Files.isRegularFile(adaptive));
        String xml = read(adaptive);
        assertTrue("Adaptive launcher must use the supplied APK STORE artwork",
                xml.contains("@drawable/ic_launcher_foreground"));
    }
}
