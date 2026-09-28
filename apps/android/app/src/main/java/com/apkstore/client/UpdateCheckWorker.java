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
            context.getSharedPreferences("update_check", Context.MODE_PRIVATE).edit()
                    .putInt("count", count).putLong("checked_at", System.currentTimeMillis()).apply();
            return Result.success();
        } catch (Exception error) { return Result.retry(); }
    }
}
