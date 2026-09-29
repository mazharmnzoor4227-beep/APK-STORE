package com.apkstore.client;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class SelfUpdateRepository {
    static final class UpdateInfo {
        final String appId;
        final String releaseId;
        final String slug;
        final String packageId;
        final String title;
        final String iconUrl;
        final long versionCode;
        final String versionName;
        final long byteSize;
        final String apkSha256;
        final String certificateSha256;
        final String releaseNotes;

        UpdateInfo(String appId, String releaseId, String slug, String packageId, String title,
                   String iconUrl, long versionCode, String versionName, long byteSize,
                   String apkSha256, String certificateSha256, String releaseNotes) {
            this.appId = appId;
            this.releaseId = releaseId;
            this.slug = slug;
            this.packageId = packageId;
            this.title = title;
            this.iconUrl = iconUrl;
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.byteSize = byteSize;
            this.apkSha256 = apkSha256;
            this.certificateSha256 = certificateSha256;
            this.releaseNotes = releaseNotes;
        }

        JSONObject asCatalogApp() throws Exception {
            JSONObject release = new JSONObject();
            release.put("id", releaseId);
            release.put("version_code", versionCode);
            release.put("version_name", versionName);
            release.put("byte_size", byteSize);
            release.put("apk_sha256", apkSha256);
            release.put("certificate_sha256", certificateSha256);
            release.put("release_notes", releaseNotes);
            JSONObject app = new JSONObject();
            app.put("id", appId);
            app.put("slug", slug);
            app.put("package_id", packageId);
            app.put("title", title);
            app.put("icon_url", iconUrl);
            app.put("current_release_id", releaseId);
            app.put("release", release);
            return app;
        }
    }

    static UpdateInfo parse(JSONObject app, JSONObject release) throws Exception {
        if (app == null || release == null) throw new Exception("APK STORE release metadata is unavailable.");
        String slug = app.optString("slug");
        String packageId = app.optString("package_id");
        if (!StoreIdentity.isStoreListing(packageId, slug)) throw new Exception("Update metadata does not belong to APK STORE.");
        String releaseId = release.optString("id");
        if (releaseId.isEmpty() || !releaseId.equals(app.optString("current_release_id")))
            throw new Exception("APK STORE release identity is inconsistent.");
        long versionCode = release.optLong("version_code", -1);
        long byteSize = release.optLong("byte_size", -1);
        String hash = StoreUpdatePolicy.normalizeFingerprint(release.optString("apk_sha256"));
        String certificate = StoreUpdatePolicy.normalizeFingerprint(release.optString("certificate_sha256"));
        if (versionCode <= 0 || byteSize <= 0 || hash.length() != 64 || certificate.length() != 64)
            throw new Exception("APK STORE release metadata is malformed.");
        String versionName = release.optString("version_name").trim();
        if (versionName.isEmpty()) throw new Exception("APK STORE version name is missing.");
        return new UpdateInfo(
                app.optString("id"), releaseId, slug, packageId,
                app.optString("title", "APK STORE"), app.optString("icon_url", ""),
                versionCode, versionName, byteSize, hash, certificate,
                release.optString("release_notes", release.optString("changelog", "")));
    }

    UpdateInfo fetchLatest() throws Exception {
        JSONObject app = fetchOne(BuildConfig.SUPABASE_URL +
                "/rest/v1/apps?select=id,slug,title,package_id,icon_url,current_release_id" +
                "&visibility=eq.published&slug=eq." + StoreIdentity.CATALOG_SLUG + "&limit=1");
        if (app == null) throw new Exception("APK STORE is not published in the catalog yet.");
        String releaseId = app.optString("current_release_id");
        if (!releaseId.matches("[0-9a-fA-F-]{36}")) throw new Exception("APK STORE release metadata is unavailable.");
        JSONObject release = fetchOne(BuildConfig.SUPABASE_URL +
                "/rest/v1/releases?select=id,version_code,version_name,byte_size,apk_sha256,certificate_sha256,release_notes,changelog" +
                "&status=eq.published&id=eq." + releaseId + "&limit=1");
        return parse(app, release);
    }

    private JSONObject fetchOne(String endpoint) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(12000);
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
        connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
        try {
            int status = connection.getResponseCode();
            if (status != 200) throw new Exception("Update service temporarily unavailable (" + status + ").");
            try (InputStream stream = connection.getInputStream()) {
                JSONArray rows = new JSONArray(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                return rows.length() == 0 ? null : rows.optJSONObject(0);
            }
        } finally {
            connection.disconnect();
        }
    }
}
