package com.apkstore.client;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

final class SettingsStore {
    private static final String GLOBAL_PREFS = "apk_store_settings";
    private static final String SELF_UPDATE_NOTIFICATIONS = "self_update_notifications";
    private final SharedPreferences preferences;
    private final Context context;

    SettingsStore(Activity activity) {
        context = activity.getApplicationContext();
        preferences = activity.getPreferences(0);
    }

    String theme() { return preferences.getString("theme", "system"); }
    void setTheme(String value) { preferences.edit().putString("theme", value).apply(); }
    int updateHours() { return preferences.getInt("update_hours", 12); }
    void setUpdateHours(int value) { preferences.edit().putInt("update_hours", value).apply(); }
    boolean contains(String key, String slug) { return preferences.getStringSet(key, Collections.emptySet()).contains(slug); }
    Set<String> entries(String key) { return new HashSet<>(preferences.getStringSet(key, Collections.emptySet())); }
    void setEntries(String key, Set<String> slugs) { preferences.edit().putStringSet(key, new HashSet<>(slugs)).apply(); }

    boolean selfUpdateNotifications() { return selfUpdateNotifications(context); }
    void setSelfUpdateNotifications(boolean enabled) {
        context.getSharedPreferences(GLOBAL_PREFS, Context.MODE_PRIVATE)
                .edit().putBoolean(SELF_UPDATE_NOTIFICATIONS, enabled).apply();
    }
    static boolean selfUpdateNotifications(Context context) {
        return context.getSharedPreferences(GLOBAL_PREFS, Context.MODE_PRIVATE)
                .getBoolean(SELF_UPDATE_NOTIFICATIONS, true);
    }
}
