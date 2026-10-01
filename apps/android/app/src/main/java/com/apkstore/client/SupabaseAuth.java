package com.apkstore.client;

import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Minimal Supabase Auth (GoTrue) REST client over HttpURLConnection,
 * matching the app's existing dependency-free networking style.
 * All calls run off the main thread; callbacks arrive on the main thread.
 */
final class SupabaseAuth {
    interface AuthCallback {
        /** session is non-null on success; on failure error holds a friendly English message. */
        void onResult(AuthSession session, String error);
    }

    interface SimpleCallback {
        void onResult(boolean ok, String error);
    }

    private final String baseUrl;
    private final String publishableKey;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    SupabaseAuth(String baseUrl, String publishableKey) {
        this.baseUrl = baseUrl;
        this.publishableKey = publishableKey;
    }

    void signUp(String email, String password, AuthCallback callback) {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email.trim());
            body.put("password", password);
        } catch (Exception ignored) {}
        post("/auth/v1/signup", body, null, callback);
    }

    void signIn(String email, String password, AuthCallback callback) {
        JSONObject body = new JSONObject();
        try {
            body.put("email", email.trim());
            body.put("password", password);
        } catch (Exception ignored) {}
        post("/auth/v1/token?grant_type=password", body, null, callback);
    }

    void signInWithGoogle(String idToken, AuthCallback callback) {
        JSONObject body = new JSONObject();
        try {
            body.put("provider", "google");
            body.put("id_token", idToken);
        } catch (Exception ignored) {}
        post("/auth/v1/token?grant_type=id_token", body, null, callback);
    }

    void refresh(String refreshToken, AuthCallback callback) {
        JSONObject body = new JSONObject();
        try {
            body.put("refresh_token", refreshToken);
        } catch (Exception ignored) {}
        post("/auth/v1/token?grant_type=refresh_token", body, null, callback);
    }

    void signOut(String accessToken, SimpleCallback callback) {
        io.execute(() -> {
            try {
                HttpURLConnection c = open("/auth/v1/logout", "POST", accessToken);
                int code = c.getResponseCode();
                c.disconnect();
                boolean ok = code >= 200 && code < 300;
                postSimple(callback, ok, ok ? null : "Sign out failed. Please try again.");
            } catch (Exception e) {
                postSimple(callback, false, AuthPolicy.friendlyError(e.toString()));
            }
        });
    }

    void resetPassword(String email, SimpleCallback callback) {
        io.execute(() -> {
            try {
                JSONObject body = new JSONObject();
                body.put("email", email.trim());
                HttpURLConnection c = open("/auth/v1/recover", "POST", null);
                writeBody(c, body);
                int code = c.getResponseCode();
                c.disconnect();
                boolean ok = code >= 200 && code < 300;
                postSimple(callback, ok, ok ? null : "Could not send the reset email. Check the address and try again.");
            } catch (Exception e) {
                postSimple(callback, false, AuthPolicy.friendlyError(e.toString()));
            }
        });
    }

    private void post(String path, JSONObject body, String accessToken, AuthCallback callback) {
        io.execute(() -> {
            try {
                HttpURLConnection c = open(path, "POST", accessToken);
                writeBody(c, body);
                int code = c.getResponseCode();
                String raw = readAll(c, code);
                c.disconnect();
                if (code >= 200 && code < 300) {
                    AuthSession session = parseSession(raw);
                    if (session != null) {
                        postAuth(callback, session, null);
                    } else {
                        // Email confirmation required: account created, no session yet.
                        postAuth(callback, null, "CONFIRM_EMAIL");
                    }
                } else {
                    postAuth(callback, null, AuthPolicy.friendlyError(extractError(raw)));
                }
            } catch (Exception e) {
                postAuth(callback, null, AuthPolicy.friendlyError(e.toString()));
            }
        });
    }

    private HttpURLConnection open(String path, String method, String accessToken) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(15000);
        c.setRequestMethod(method);
        c.setRequestProperty("apikey", publishableKey);
        c.setRequestProperty("Content-Type", "application/json");
        if (accessToken != null && !accessToken.isEmpty()) {
            c.setRequestProperty("Authorization", "Bearer " + accessToken);
        }
        return c;
    }

    private void writeBody(HttpURLConnection c, JSONObject body) throws Exception {
        c.setDoOutput(true);
        byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
        try (OutputStream out = c.getOutputStream()) {
            out.write(bytes);
        }
    }

    private String readAll(HttpURLConnection c, int code) {
        try {
            InputStream in = code >= 200 && code < 300 ? c.getInputStream() : c.getErrorStream();
            if (in == null) return "";
            return new String(Io.readAllBytes(in), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

    private AuthSession parseSession(String raw) {
        try {
            JSONObject o = new JSONObject(raw);
            String access = o.optString("access_token", "");
            if (access.isEmpty()) return null;
            JSONObject user = o.optJSONObject("user");
            return AuthSession.fromParts(access, o.optString("refresh_token", ""),
                    o.optLong("expires_in", 3600),
                    user == null ? "" : user.optString("id", ""),
                    user == null ? "" : user.optString("email", ""),
                    System.currentTimeMillis());
        } catch (Exception e) {
            return null;
        }
    }

    private String extractError(String raw) {
        try {
            JSONObject o = new JSONObject(raw);
            String msg = o.optString("msg", "");
            if (!msg.isEmpty()) return msg;
            String desc = o.optString("error_description", "");
            if (!desc.isEmpty()) return desc;
            String err = o.optString("error", "");
            if (!err.isEmpty()) return err;
            String message = o.optString("message", "");
            if (!message.isEmpty()) return message;
        } catch (Exception ignored) {}
        return raw;
    }

    private void postAuth(AuthCallback callback, AuthSession session, String error) {
        main.post(() -> callback.onResult(session, error));
    }

    private void postSimple(SimpleCallback callback, boolean ok, String error) {
        main.post(() -> callback.onResult(ok, error));
    }
}
