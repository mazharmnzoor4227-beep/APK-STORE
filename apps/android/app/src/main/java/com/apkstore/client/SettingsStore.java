package com.apkstore.client;

import android.app.Activity;
import android.content.SharedPreferences;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;

final class SettingsStore {
    private final SharedPreferences preferences;
    SettingsStore(Activity activity) { preferences = activity.getPreferences(0); }
    String theme() { return preferences.getString("theme", "system"); }
    void setTheme(String value) { preferences.edit().putString("theme", value).apply(); }
    int updateHours() { return preferences.getInt("update_hours", 12); }
    void setUpdateHours(int value) { preferences.edit().putInt("update_hours", value).apply(); }
    boolean contains(String key, String slug) { return preferences.getStringSet(key, Collections.emptySet()).contains(slug); }
    Set<String> entries(String key) { return new HashSet<>(preferences.getStringSet(key, Collections.emptySet())); }
    void setEntries(String key, Set<String> slugs) { preferences.edit().putStringSet(key, new HashSet<>(slugs)).apply(); }
}
