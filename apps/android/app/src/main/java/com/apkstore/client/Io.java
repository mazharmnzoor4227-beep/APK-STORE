package com.apkstore.client;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

final class Io {
    private Io() {}

    /**
     * InputStream.readAllBytes() exists only on API 33+. This manual loop
     * behaves the same and works back to minSdk 26, so network responses
     * keep working on Android 8-12 instead of throwing NoSuchMethodError.
     */
    static byte[] readAllBytes(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
        return out.toByteArray();
    }
}
