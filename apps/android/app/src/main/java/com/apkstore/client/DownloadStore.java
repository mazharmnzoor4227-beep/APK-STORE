package com.apkstore.client;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

final class DownloadStore {
    private final Context context;
    DownloadStore(Context context) { this.context = context; }
    JSONArray attempts() {
        try { return new JSONArray(context.getSharedPreferences("downloads", 0).getString("history", "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }
    void record(String slug, String title, String status, String error, long id, String path, int progress) {
        try {
            JSONArray prior = attempts(), next = new JSONArray();
            JSONObject current = new JSONObject().put("slug", slug).put("title", title).put("status", status)
                    .put("error", error).put("id", id).put("path", path)
                    .put("progress", progress).put("time", System.currentTimeMillis());
            next.put(current);
            for (int i = 0; i < prior.length() && i < 99; i++) {
                JSONObject entry = prior.optJSONObject(i);
                if (entry != null && (id <= 0 || entry.optLong("id") != id)) next.put(entry);
            }
            context.getSharedPreferences("downloads", 0).edit().putString("history", next.toString()).apply();
        } catch (Exception ignored) { }
    }
    void clear() { context.getSharedPreferences("downloads", 0).edit().remove("history").apply(); }
}
