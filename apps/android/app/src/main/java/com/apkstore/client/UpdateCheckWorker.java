package com.apkstore.client;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class UpdateCheckWorker extends Worker {
    public static final String CHANNEL_ID = "app_updates";
    private static final int NOTIF_ID = 1001;
    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        try {
            JSONArray apps = new CatalogRepository(context).fetch();
            android.content.SharedPreferences main = context.getSharedPreferences("MainActivity", 0);
            android.content.SharedPreferences prefs = context.getSharedPreferences("update_check", Context.MODE_PRIVATE);
            java.util.Set<String> notified = new java.util.HashSet<>(
                    prefs.getStringSet("notified", java.util.Collections.emptySet()));
            java.util.Set<String> stillAvailable = new java.util.HashSet<>();
            java.util.ArrayList<JSONObject> fresh = new java.util.ArrayList<>();
            int count = 0;
            for (int i = 0; i < apps.length(); i++) {
                JSONObject app = apps.optJSONObject(i);
                if (app == null) continue;
                long installed;
                try {
                    PackageInfo info = context.getPackageManager().getPackageInfo(app.optString("package_id"), 0);
                    installed = info.getLongVersionCode();
                } catch (PackageManager.NameNotFoundException ignored) { continue; }
                String id = app.optString("current_release_id");
                if (!id.matches("[0-9a-fA-F-]{36}")) continue;
                String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/releases?select=version_code,version_name&id=eq." + id + "&status=eq.published";
                HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
                try {
                    if (connection.getResponseCode() != 200) return Result.retry();
                    try (InputStream stream = connection.getInputStream()) {
                        JSONArray releases = new JSONArray(new String(Io.readAllBytes(stream), StandardCharsets.UTF_8));
                        if (releases.length() == 0) continue;
                        long latest = releases.getJSONObject(0).optLong("version_code");
                        String slug = app.optString("slug");
                        if (!UpdateLogic.available(installed, latest,
                                main.getStringSet("ignored", java.util.Collections.emptySet()).contains(slug),
                                main.getStringSet("blacklist", java.util.Collections.emptySet()).contains(slug))) continue;
                        count++;
                        String key = slug + ":" + latest;
                        stillAvailable.add(key);
                        if (notified.contains(key)) continue;
                        JSONObject n = new JSONObject();
                        n.put("title", app.optString("title", slug));
                        n.put("version", releases.getJSONObject(0).optString("version_name", ""));
                        fresh.add(n);
                    }
                } finally { connection.disconnect(); }
            }
            notified.retainAll(stillAvailable);
            notified.addAll(stillAvailable);
            prefs.edit().putInt("count", count).putLong("checked_at", System.currentTimeMillis())
                    .putStringSet("notified", notified).apply();
            if (!fresh.isEmpty() && main.getBoolean("notifications", true) && canNotify(context)) {
                postUpdateNotification(context, fresh);
            }
            return Result.success();
        } catch (Exception error) { return Result.retry(); }
    }

    private static boolean canNotify(Context context) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(
                    android.Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) return false;
            if (android.os.Build.VERSION.SDK_INT >= 24) {
                android.app.NotificationManager nm = context.getSystemService(android.app.NotificationManager.class);
                return nm != null && nm.areNotificationsEnabled();
            }
            return true;
        } catch (Throwable ignored) { return false; }
    }

    private static void postUpdateNotification(Context context, java.util.ArrayList<JSONObject> fresh) {
        try {
            android.content.Intent intent = new android.content.Intent(context, MainActivity.class);
            intent.setAction("com.apkstore.client.OPEN_UPDATES");
            intent.putExtra("open_tab", "updates");
            intent.setFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(context, 0, intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
            android.app.Notification.Builder b = new android.app.Notification.Builder(context, CHANNEL_ID);
            b.setSmallIcon(R.drawable.ic_stat_update);
            b.setContentIntent(pi);
            b.setAutoCancel(true);
            if (fresh.size() == 1) {
                JSONObject a = fresh.get(0);
                b.setContentTitle(a.optString("title"));
                String v = a.optString("version");
                b.setContentText("New update available" + (v.isEmpty() ? "" : " \u2022 " + v));
            } else {
                b.setContentTitle(fresh.size() + " app updates available");
                b.setContentText("Tap to see what's new");
                android.app.Notification.InboxStyle inbox = new android.app.Notification.InboxStyle();
                int show = Math.min(5, fresh.size());
                for (int i = 0; i < show; i++) {
                    JSONObject a = fresh.get(i);
                    String v = a.optString("version");
                    inbox.addLine(a.optString("title") + (v.isEmpty() ? "" : " \u2022 " + v));
                }
                if (fresh.size() > show) inbox.setSummaryText("+" + (fresh.size() - show) + " more");
                b.setStyle(inbox);
            }
            android.app.NotificationManager nm = context.getSystemService(android.app.NotificationManager.class);
            if (nm != null) nm.notify(NOTIF_ID, b.build());
        } catch (Throwable ignored) { }
    }
}
