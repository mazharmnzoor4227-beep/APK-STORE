package com.apkstore.client;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

final class CrashQueue {
    private static final int MAX_PENDING = 20;
    private final File root;

    CrashQueue(File root) {
        this.root = root;
    }

    synchronized File enqueue(String json) throws Exception {
        ensureRoot();
        trimOldest();
        String base = String.format(java.util.Locale.ROOT, "%013d-%s", System.currentTimeMillis(), UUID.randomUUID().toString());
        File temporary = new File(root, base + ".tmp");
        File target = new File(root, base + ".json");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(json.getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        if (!temporary.renameTo(target)) {
            temporary.delete();
            throw new Exception("Crash report queue unavailable");
        }
        return target;
    }

    synchronized List<File> pending() {
        if (!root.isDirectory()) return new ArrayList<>();
        File[] files = root.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null || files.length == 0) return new ArrayList<>();
        Arrays.sort(files, Comparator.comparing(File::getName));
        return new ArrayList<>(Arrays.asList(files));
    }

    synchronized String read(File file) throws Exception {
        if (file == null || !file.isFile() || !file.getCanonicalFile().getParentFile().equals(root.getCanonicalFile()))
            throw new SecurityException("Invalid crash queue file");
        return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
    }

    synchronized void delete(File file) {
        if (file == null) return;
        try {
            if (file.getCanonicalFile().getParentFile().equals(root.getCanonicalFile())) file.delete();
        } catch (Exception ignored) { }
    }

    private void ensureRoot() throws Exception {
        if (!root.exists() && !root.mkdirs()) throw new Exception("Crash report queue unavailable");
        if (!root.isDirectory()) throw new Exception("Crash report queue unavailable");
    }

    private void trimOldest() {
        List<File> files = pending();
        while (files.size() >= MAX_PENDING) {
            File oldest = files.remove(0);
            oldest.delete();
        }
    }
}
