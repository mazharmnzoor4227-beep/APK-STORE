package com.apkstore.client;

/**
 * Supabase Auth session: tokens plus the signed-in user's id/email.
 * Pure Java (no Android dependencies) so expiry math and serialization
 * can be unit-tested on the JVM. JSON parsing lives in SupabaseAuth
 * (Android side, org.json); this class takes plain parts.
 */
final class AuthSession {
    final String accessToken;
    final String refreshToken;
    final long expiresAtMillis;
    final String userId;
    final String email;
    /** "google", "email", or "" when unknown (e.g. sessions saved before this field existed). */
    final String provider;

    private AuthSession(String accessToken, String refreshToken, long expiresAtMillis,
                        String userId, String email, String provider) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        this.expiresAtMillis = expiresAtMillis;
        this.userId = userId;
        this.email = email;
        this.provider = provider == null ? "" : provider;
    }

    static AuthSession fromParts(String accessToken, String refreshToken, long expiresInSeconds,
                                 String userId, String email, long nowMillis) {
        if (accessToken == null || accessToken.isEmpty()) return null;
        long expiresAt = nowMillis + Math.max(0, expiresInSeconds) * 1000L;
        return new AuthSession(accessToken, refreshToken == null ? "" : refreshToken,
                expiresAt, userId == null ? "" : userId, email == null ? "" : email, "");
    }

    /** Copy of this session tagged with the sign-in provider ("google" / "email"). */
    AuthSession withProvider(String provider) {
        return new AuthSession(accessToken, refreshToken, expiresAtMillis, userId, email, provider);
    }

    /** True when the access token should be refreshed (60s leeway). */
    boolean needsRefresh(long nowMillis) {
        return nowMillis + 60_000L >= expiresAtMillis;
    }

    boolean isSignedIn() {
        return accessToken != null && !accessToken.isEmpty();
    }

    /** Compact serialization for SharedPreferences. Fields are base64url-encoded to avoid delimiter issues.
     * The provider field is appended; older 5-field sessions still load (provider = ""). */
    String serialize() {
        return enc(accessToken) + "|" + enc(refreshToken) + "|" + expiresAtMillis
                + "|" + enc(userId) + "|" + enc(email) + "|" + enc(provider);
    }

    static AuthSession deserialize(String raw) {
        if (raw == null || raw.isEmpty()) return null;
        String[] parts = raw.split("\\|", -1);
        if (parts.length != 5 && parts.length != 6) return null;
        try {
            return new AuthSession(dec(parts[0]), dec(parts[1]), Long.parseLong(parts[2]),
                    dec(parts[3]), dec(parts[4]), parts.length == 6 ? dec(parts[5]) : "");
        } catch (Exception e) {
            return null;
        }
    }

    private static String enc(String s) {
        try {
            return java.util.Base64.getUrlEncoder().withoutPadding()
                    .encodeToString(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        } catch (Exception e) {
            return "";
        }
    }

    private static String dec(String s) {
        try {
            return new String(java.util.Base64.getUrlDecoder().decode(s),
                    java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }
}
