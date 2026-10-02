package com.apkstore.client;

import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.util.Locale;
import java.util.zip.GZIPInputStream;

/**
 * Gzip negotiation for JSON API calls.
 *
 * <p>Supabase's gateway gzip-compresses JSON responses (the catalog shrinks ~75%,
 * e.g. 26.6&nbsp;KB &rarr; 6.9&nbsp;KB), but only when the client sends
 * {@code Accept-Encoding: gzip}. Browsers do this automatically; HttpURLConnection
 * does not, so every call site opts in via {@link #gzip(HttpURLConnection)} and
 * reads through {@link #decoded(HttpURLConnection)}.
 *
 * <p>Already-compressed payloads (APK downloads via DownloadManager, PNG icons)
 * never go through this helper, so there is no double-compression risk: we only
 * wrap the stream when the server's {@code Content-Encoding} actually says gzip.
 */
final class Net {
    private Net() {}

    /** Ask the server to gzip the response. Call before connecting. */
    static void gzip(HttpURLConnection c) {
        c.setRequestProperty("Accept-Encoding", "gzip");
    }

    /** Response stream, transparently gunzipped when the server compressed it. */
    static InputStream decoded(HttpURLConnection c) throws IOException {
        return wrap(c, c.getInputStream());
    }

    /** Gunzip {@code in} only if the connection's Content-Encoding says gzip. */
    static InputStream wrap(HttpURLConnection c, InputStream in) throws IOException {
        if (in == null) return null;
        String enc = c.getContentEncoding();
        if (enc != null && enc.toLowerCase(Locale.ROOT).contains("gzip")) {
            return new GZIPInputStream(in);
        }
        return in;
    }
}
