package com.apkstore.client;

import android.content.Context;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

final class CrashQueue {
    static final int MAX_REPORTS = 8;
    static final long MAX_TOTAL_BYTES = 192_000L;
    static final long MAX_REPORT_BYTES = 24_000L;

    private final File directory;
    private final int maxReports;
    private final long maxTotalBytes;

    CrashQueue(Context context) {
        this(new File(context.getFilesDir(), "crash-reports"), MAX_REPORTS, MAX_TOTAL_BYTES);
    }

    CrashQueue(File directory, int maxReports, long maxTotalBytes) {
        this.directory = directory;
        this.maxReports = maxReports;
        this.maxTotalBytes = maxTotalBytes;
    }

    synchronized boolean enqueue(String json, long timestamp) throws Exception {
        byte[] data = json.getBytes(StandardCharsets.UTF_8);
        if (data.length == 0 || data.length > MAX_REPORT_BYTES) return false;
        ensureDirectory();
        pruneFor(data.length);
        File temporary = new File(directory, timestamp + ".tmp");
        File destination = new File(directory, timestamp + ".json");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(data);
            output.getFD().sync();
        }
        if (!temporary.renameTo(destination)) {
            temporary.delete();
            throw new Exception("Crash queue write failed");
        }
        return true;
    }

    synchronized List<File> pending() {
        ensureDirectory();
        File[] files = directory.listFiles((dir, name) -> name.endsWith(".json"));
        if (files == null) return new ArrayList<>();
        Arrays.sort(files, Comparator.comparingLong(File::lastModified).thenComparing(File::getName));
        return new ArrayList<>(Arrays.asList(files));
    }

    synchronized void acknowledge(File file) {
        if (file != null && file.getParentFile() != null && file.getParentFile().equals(directory)) file.delete();
    }

    private void ensureDirectory() {
        if (!directory.isDirectory()) directory.mkdirs();
    }

    private void pruneFor(long incomingBytes) {
        List<File> files = pending();
        long bytes = 0;
        for (File file : files) bytes += Math.max(0, file.length());
        int index = 0;
        while (index < files.size() && (files.size() - index >= maxReports || bytes + incomingBytes > maxTotalBytes)) {
            File old = files.get(index++);
            bytes -= Math.max(0, old.length());
            old.delete();
        }
    }
}
