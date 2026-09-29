package com.apkstore.client;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class CatalogRepository {
    private final File cache;
    CatalogRepository(Context context) { cache = new File(context.getFilesDir(), "catalog.json"); }

    JSONArray cached() {
        try {
            JSONArray cached = new JSONArray(new String(java.nio.file.Files.readAllBytes(cache.toPath()), StandardCharsets.UTF_8));
            return visibleOnly(cached);
        } catch (Exception ignored) { return new JSONArray(); }
    }

    void save(JSONArray apps) throws Exception {
        File temporary = new File(cache.getParentFile(), "catalog.tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(visibleOnly(apps).toString().getBytes(StandardCharsets.UTF_8));
            output.getFD().sync();
        }
        if (!temporary.renameTo(cache)) throw new Exception("Catalog cache unavailable");
    }

    JSONArray fetch() throws Exception {
        JSONArray result = new JSONArray();
        final int pageSize = 100;
        for (int offset = 0; ; offset += pageSize) {
            String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/apps?select=id,slug,title,package_id,category,description,icon_url,current_release_id,created_at,updated_at,github_owner,github_repo,license,min_sdk,short_description,screenshots,is_recommended,stars,source_url,price_type,fdroid_url,vendor&visibility=eq.published&current_release_id=not.is.null&order=created_at.desc,id.desc&limit=" + pageSize + "&offset=" + offset;
            HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
            connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
            connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
            connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
            try {
                if (connection.getResponseCode() != 200) throw new Exception("Catalog temporarily unavailable (" + connection.getResponseCode() + ").");
                JSONArray page;
                try (InputStream stream = connection.getInputStream()) {
                    page = new JSONArray(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                }
                for (int i = 0; i < page.length(); i++) {
                    JSONObject app = page.optJSONObject(i);
                    if (app != null && CatalogPolicy.shouldList(app.optString("slug"), app.optString("package_id"))) result.put(app);
                }
                if (page.length() < pageSize) return result;
            } finally { connection.disconnect(); }
        }
    }

    private JSONArray visibleOnly(JSONArray apps) {
        JSONArray result = new JSONArray();
        for (int i = 0; i < apps.length(); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app != null && CatalogPolicy.shouldList(app.optString("slug"), app.optString("package_id"))) result.put(app);
        }
        return result;
    }
}
