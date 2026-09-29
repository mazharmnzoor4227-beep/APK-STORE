package com.apkstore.client;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
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
    private static final String PREFS = "update_check";
    private static final String CHANNEL = "apk_store_updates";
    private static final int SELF_UPDATE_NOTIFICATION = 4101;

    public UpdateCheckWorker(@NonNull Context context, @NonNull WorkerParameters parameters) { super(context, parameters); }

    @NonNull @Override public Result doWork() {
        Context context = getApplicationContext();
        try {
            JSONArray apps = new CatalogRepository(context).fetch();
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
                String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/releases?select=version_code&id=eq." + id + "&status=eq.published";
                HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
                try {
                    if (connection.getResponseCode() != 200) return Result.retry();
                    try (InputStream stream = connection.getInputStream()) {
                        JSONArray releases = new JSONArray(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                        if (releases.length() > 0 && UpdateLogic.available(installed,
                                releases.getJSONObject(0).optLong("version_code"),
                                context.getSharedPreferences("MainActivity", 0).getStringSet("ignored", java.util.Collections.emptySet()).contains(app.optString("slug")),
                                context.getSharedPreferences("MainActivity", 0).getStringSet("blacklist", java.util.Collections.emptySet()).contains(app.optString("slug")))) count++;
                    }
                } finally { connection.disconnect(); }
            }
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putInt("count", count).putLong("checked_at", System.currentTimeMillis()).apply();
            checkSelfUpdate(context);
            return Result.success();
        } catch (Exception error) { return Result.retry(); }
    }

    private void checkSelfUpdate(Context context) {
        try {
            SelfUpdateRepository.UpdateInfo info = new SelfUpdateRepository().fetchLatest();
            boolean newer = StoreUpdatePolicy.isUpdateAvailable(BuildConfig.VERSION_CODE, info.versionCode);
            String validation = newer ? StoreUpdatePolicy.validateMetadata(
                    info.packageId, info.slug, BuildConfig.VERSION_CODE, info.versionCode,
                    info.apkSha256, info.byteSize, info.certificateSha256,
                    BuildConfig.APK_STORE_SIGNER_SHA256) : null;
            boolean trusted = !newer || validation == null;
            boolean enabled = SettingsStore.selfUpdateNotifications(context);
            if (!SelfUpdateNotificationPolicy.shouldNotify(BuildConfig.VERSION_CODE, info.versionCode, enabled, trusted)) return;
            long last = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                    .getLong("last_self_update_notification", -1);
            if (!SelfUpdateNotificationPolicy.isNewNotification(info.versionCode, last)) return;
            if (showSelfUpdateNotification(context, info)) {
                context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                        .putLong("last_self_update_notification", info.versionCode).apply();
            }
        } catch (Exception ignored) {
            // Catalog checks should continue even when the dedicated self-update check is temporarily unavailable.
        }
    }

    private boolean showSelfUpdateNotification(Context context, SelfUpdateRepository.UpdateInfo info) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            return false;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        NotificationChannel channel = new NotificationChannel(CHANNEL, "APK STORE updates", NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription("New verified APK STORE versions");
        manager.createNotificationChannel(channel);
        Intent open = new Intent(context, MainActivity.class)
                .putExtra("show_self_update", true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(context, SELF_UPDATE_NOTIFICATION, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String version = info.versionName == null || info.versionName.isBlank() ? String.valueOf(info.versionCode) : info.versionName;
        Notification notification = new Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_download)
                .setContentTitle("APK STORE update available")
                .setContentText("Version " + version + " is ready to install")
                .setContentIntent(pending)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .build();
        manager.notify(SELF_UPDATE_NOTIFICATION, notification);
        return true;
    }
}
