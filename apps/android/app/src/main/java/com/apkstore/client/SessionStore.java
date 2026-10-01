package com.apkstore.client;

import android.content.Context;
import android.content.SharedPreferences;

/** Persists the Supabase Auth session in private SharedPreferences. */
final class SessionStore {
    private static final String PREFS = "auth_session";
    private static final String KEY_SESSION = "session";

    private final SharedPreferences prefs;

    SessionStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    void save(AuthSession session) {
        prefs.edit().putString(KEY_SESSION, session == null ? "" : session.serialize()).apply();
    }

    AuthSession load() {
        return AuthSession.deserialize(prefs.getString(KEY_SESSION, ""));
    }

    void clear() {
        prefs.edit().remove(KEY_SESSION).apply();
    }
}
