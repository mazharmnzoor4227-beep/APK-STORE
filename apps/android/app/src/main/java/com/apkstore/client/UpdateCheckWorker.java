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
    private static final int NOTIF_ID_SELF = 1002;
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
            java.util.ArrayList<JSONObject> freshSelf = new java.util.ArrayList<>();
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
                    // One app's transient failure must not discard the whole batch and
                    // force an unbounded full retry loop — skip it and keep partial results.
                    if (connection.getResponseCode() != 200) continue;
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
            // APK STORE is excluded from the public catalog listing, so check its own
            // release directly — otherwise a self-update can never raise a notification.
            try {
                JSONObject self = checkSelfUpdate(context);
                if (self != null && self.optLong("version_code") > BuildConfig.VERSION_CODE) {
                    String key = "apk-store-client:" + self.optLong("version_code");
                    stillAvailable.add(key);
                    if (!notified.contains(key)) {
                        JSONObject n = new JSONObject();
                        n.put("title", "APK STORE");
                        n.put("version", self.optString("version_name", ""));
                        freshSelf.add(n);
                    }
                }
            } catch (Throwable ignored) { }
            notified.retainAll(stillAvailable);
            notified.addAll(stillAvailable);
            prefs.edit().putInt("count", count).putLong("checked_at", System.currentTimeMillis())
                    .putStringSet("notified", notified).apply();
            if (canNotify(context)) {
                if (!fresh.isEmpty()) postUpdateNotification(context, fresh);
                if (!freshSelf.isEmpty()) postSelfUpdateNotification(context, freshSelf.get(0));
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

    /** Returns {version_code, version_name} of the newest published APK STORE release, or null. */
    private static JSONObject checkSelfUpdate(Context context) {
        HttpURLConnection c = null;
        HttpURLConnection rc = null;
        try {
            String endpoint = BuildConfig.SUPABASE_URL
                    + "/rest/v1/apps?select=slug,title,package_id,current_release_id&slug=eq.apk-store-client&visibility=eq.published&limit=1";
            c = (HttpURLConnection) new URL(endpoint).openConnection();
            c.setConnectTimeout(12000); c.setReadTimeout(12000);
            c.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
            c.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
            if (c.getResponseCode() != 200) return null;
            JSONArray rows;
            try (InputStream in = c.getInputStream()) {
                rows = new JSONArray(new String(Io.readAllBytes(in), StandardCharsets.UTF_8));
            } finally { c.disconnect(); c = null; }
            if (rows.length() == 0) return null;
            String releaseId = rows.getJSONObject(0).optString("current_release_id");
            if (!releaseId.matches("[0-9a-fA-F-]{36}")) return null;
            String rep = BuildConfig.SUPABASE_URL
                    + "/rest/v1/releases?select=id,version_code,version_name&id=eq." + releaseId + "&status=eq.published&limit=1";
            rc = (HttpURLConnection) new URL(rep).openConnection();
            rc.setConnectTimeout(12000); rc.setReadTimeout(12000);
            rc.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
            rc.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
            if (rc.getResponseCode() != 200) return null;
            JSONArray rrows;
            try (InputStream in = rc.getInputStream()) {
                rrows = new JSONArray(new String(Io.readAllBytes(in), StandardCharsets.UTF_8));
            } finally { rc.disconnect(); rc = null; }
            if (rrows.length() == 0) return null;
            return rrows.getJSONObject(0);
        } catch (Throwable ignored) { return null; }
        finally {
            try { if (c != null) c.disconnect(); } catch (Throwable ignored) { }
            try { if (rc != null) rc.disconnect(); } catch (Throwable ignored) { }
        }
    }

    private static void postSelfUpdateNotification(Context context, JSONObject self) {
        try {
            android.content.Intent intent = new android.content.Intent(context, MainActivity.class);
            intent.setAction("com.apkstore.client.OPEN_SELF_UPDATE");
            intent.putExtra("open_tab", "self_update");
            intent.setFlags(android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP | android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP);
            android.app.PendingIntent pi = android.app.PendingIntent.getActivity(context, 1, intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
            String v = self.optString("version", "");
            android.app.Notification.Builder b = new android.app.Notification.Builder(context, CHANNEL_ID);
            b.setSmallIcon(R.drawable.ic_stat_update);
            b.setContentTitle("APK STORE update available");
            b.setContentText("Tap to update" + (v.isEmpty() ? "" : " \u2022 " + v));
            b.setContentIntent(pi);
            b.setAutoCancel(true);
            android.app.NotificationManager nm = context.getSystemService(android.app.NotificationManager.class);
            if (nm != null) nm.notify(NOTIF_ID_SELF, b.build());
        } catch (Throwable ignored) { }
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
