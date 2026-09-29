from pathlib import Path

p = Path("apps/android/app/src/main/java/com/apkstore/client/MainActivity.java")
s = p.read_text()


def rep(old: str, new: str, label: str):
    global s
    if old not in s:
        raise SystemExit(f"marker not found: {label}")
    s = s.replace(old, new, 1)


rep(
    "    private Runnable installResultPoll;\n    private final HashMap<String, Integer> downloadProgress = new HashMap<>();",
    "    private Runnable installResultPoll;\n"
    "    private JSONObject selfUpdateApp;\n"
    "    private LinearLayout selfUpdatePage;\n"
    "    private TextView selfUpdateStatus, selfUpdateProgress;\n"
    "    private ProgressRing selfUpdateRing;\n"
    "    private android.widget.Button selfUpdateButton;\n"
    "    private Runnable selfUpdateUiPoll;\n"
    "    private final HashMap<String, Integer> downloadProgress = new HashMap<>();",
    "fields",
)

rep(
    "        history = new DownloadStore(this);\n        JSONArray attempts = history.attempts();",
    "        history = new DownloadStore(this);\n"
    "        try {\n"
    "            String savedSelfUpdate = getSharedPreferences(\"self_update\", MODE_PRIVATE).getString(\"target\", null);\n"
    "            if (savedSelfUpdate != null && !savedSelfUpdate.isEmpty()) selfUpdateApp = new JSONObject(savedSelfUpdate);\n"
    "        } catch (Exception ignored) { }\n"
    "        JSONArray attempts = history.attempts();",
    "restore target",
)

rep(
    "            if (detailApp != null) consumeInstallResult(detailApp.optString(\"slug\"));\n            if (detailApp != null) refreshDetail();",
    "            if (detailApp != null) consumeInstallResult(detailApp.optString(\"slug\"));\n"
    "            if (selfUpdateApp != null) {\n"
    "                consumeInstallResult(selfUpdateApp.optString(\"slug\"));\n"
    "                updateSelfUpdateUi();\n"
    "            }\n"
    "            if (detailApp != null) refreshDetail();",
    "resume self result",
)

rep(
    '                String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/apps?select=slug,title,current_release_id&slug=eq.apk-store-client&visibility=eq.published&limit=1";',
    '                String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/apps?select=slug,title,package_id,current_release_id&slug=eq.apk-store-client&visibility=eq.published&limit=1";',
    "self app select",
)

rep(
    '                String rep = BuildConfig.SUPABASE_URL + "/rest/v1/releases?select=version_code,version_name,release_notes,byte_size&id=eq." + releaseId + "&limit=1";',
    '                String rep = BuildConfig.SUPABASE_URL + "/rest/v1/releases?select=id,version_code,version_name,release_notes,changelog,apk_sha256,byte_size,certificate_sha256,min_sdk&id=eq." + releaseId + "&status=eq.published&limit=1";',
    "self release select",
)

rep(
    '                org.json.JSONObject rel = rrows.getJSONObject(0);\n                long latest = rel.optLong("version_code");',
    '                org.json.JSONObject rel = rrows.getJSONObject(0);\n'
    '                self.put("package_id", getPackageName());\n'
    '                self.put("release", rel);\n'
    '                selfUpdateApp = self;\n'
    '                getSharedPreferences("self_update", MODE_PRIVATE).edit().putString("target", self.toString()).apply();\n'
    '                long latest = rel.optLong("version_code");',
    "retain fresh release",
)

rep(
    '''                        android.widget.Button update = new android.widget.Button(this);
                        update.setText("Update now");
                        update.setOnClickListener(v -> {
                            // Reuse the catalog download flow: integrity + cert checks included.
                            for (int i = 0; i < catalog.length(); i++) {
                                org.json.JSONObject app = catalog.optJSONObject(i);
                                if (app != null && "apk-store-client".equals(app.optString("slug"))) { startDownload(app); showTab(APPS); return; }
                            }
                            android.widget.Toast.makeText(this, "Release found, but catalog needs refresh. Pull to refresh, then retry.", android.widget.Toast.LENGTH_LONG).show();
                        });
                        page.addView(update);''',
    '''                        selfUpdatePage = page;
                        selfUpdateRing = new ProgressRing();
                        selfUpdateRing.setVisibility(View.GONE);
                        page.addView(selfUpdateRing, new LinearLayout.LayoutParams(dp(64), dp(64)));
                        selfUpdateStatus = text("Ready to update", 14, muted(), false);
                        page.addView(selfUpdateStatus);
                        selfUpdateProgress = text("", 13, green(), true);
                        page.addView(selfUpdateProgress);
                        selfUpdateButton = new android.widget.Button(this);
                        selfUpdateButton.setText("Update now");
                        selfUpdateButton.setOnClickListener(v -> startSelfUpdate(self));
                        page.addView(selfUpdateButton);
                        updateSelfUpdateUi();''',
    "update button",
)

marker = "    private void informationLink(LinearLayout page, String title, String subtitle, Runnable open) {"
methods = '''    private void startSelfUpdate(JSONObject self) {
        selfUpdateApp = self;
        getSharedPreferences("self_update", MODE_PRIVATE).edit().putString("target", self.toString()).apply();
        String slug = self.optString("slug");
        if (completedDownloads.containsKey(slug)) {
            if (selfUpdateStatus != null) selfUpdateStatus.setText("Installing update…");
            openDownloaded(slug);
        } else if (!downloads.containsKey(slug)) {
            startDownload(self);
        }
        updateSelfUpdateUi();
        pollSelfUpdateUi();
    }

    private JSONObject appForDownload(String slug) {
        if (selfUpdateApp != null && slug.equals(selfUpdateApp.optString("slug"))) return selfUpdateApp;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && slug.equals(app.optString("slug"))) return app;
        }
        return null;
    }

    private void pollSelfUpdateUi() {
        if (selfUpdateUiPoll != null) handler.removeCallbacks(selfUpdateUiPoll);
        selfUpdateUiPoll = new Runnable() {
            @Override public void run() {
                if (selfUpdateApp == null || selfUpdatePage == null) { selfUpdateUiPoll = null; return; }
                updateSelfUpdateUi();
                String slug = selfUpdateApp.optString("slug");
                if (downloads.containsKey(slug) || completedDownloads.containsKey(slug)) handler.postDelayed(this, 400);
                else selfUpdateUiPoll = null;
            }
        };
        handler.post(selfUpdateUiPoll);
    }

    private void updateSelfUpdateUi() {
        if (selfUpdateApp == null || selfUpdateStatus == null) return;
        String slug = selfUpdateApp.optString("slug");
        JSONObject release = selfUpdateApp.optJSONObject("release");
        long target = release == null ? Long.MAX_VALUE : release.optLong("version_code", Long.MAX_VALUE);
        long installed = installedVersion(getPackageName());
        if (installed >= target) {
            selfUpdateStatus.setText("Update installed");
            if (selfUpdateProgress != null) selfUpdateProgress.setText("Version " + BuildConfig.VERSION_NAME);
            if (selfUpdateRing != null) selfUpdateRing.setVisibility(View.GONE);
            if (selfUpdateButton != null) { selfUpdateButton.setText("Up to date"); selfUpdateButton.setEnabled(false); }
            getSharedPreferences("self_update", MODE_PRIVATE).edit().remove("target").apply();
            return;
        }
        if (downloads.containsKey(slug)) {
            int progress = downloadProgress.getOrDefault(slug, 0);
            selfUpdateStatus.setText("Downloading update…");
            if (selfUpdateProgress != null) selfUpdateProgress.setText(progress + "%  " + downloadSizes.getOrDefault(slug, ""));
            if (selfUpdateRing != null) { selfUpdateRing.setVisibility(View.VISIBLE); selfUpdateRing.setProgress(progress); }
            if (selfUpdateButton != null) { selfUpdateButton.setText("Downloading update"); selfUpdateButton.setEnabled(false); }
            return;
        }
        if (completedDownloads.containsKey(slug)) {
            selfUpdateStatus.setText("Installing update…");
            if (selfUpdateProgress != null) selfUpdateProgress.setText("Android will ask you to confirm installation");
            if (selfUpdateRing != null) { selfUpdateRing.setVisibility(View.VISIBLE); selfUpdateRing.setProgress(100); }
            if (selfUpdateButton != null) { selfUpdateButton.setText("Installing update"); selfUpdateButton.setEnabled(false); }
            return;
        }
        String error = downloadErrors.get(slug);
        if (error != null && !error.isEmpty()) {
            selfUpdateStatus.setText(error);
            if (selfUpdateRing != null) selfUpdateRing.setVisibility(View.GONE);
            if (selfUpdateProgress != null) selfUpdateProgress.setText("");
            if (selfUpdateButton != null) { selfUpdateButton.setText("Retry update"); selfUpdateButton.setEnabled(true); }
        }
    }

'''
rep(marker, methods + marker, "self update helpers")

rep(
    '''        JSONObject app = null;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject candidate = catalog.optJSONObject(i);
            if (candidate != null && slug.equals(candidate.optString("slug"))) { app = candidate; break; }
        }
        if (app == null) { downloadErrors.put(slug, "Listing unavailable. Refresh the catalog."); refreshDetail(); return; }''',
    '''        JSONObject app = appForDownload(slug);
        if (app == null) { downloadErrors.put(slug, "Release metadata unavailable. Check for updates again."); refreshDetail(); updateSelfUpdateUi(); return; }''',
    "openDownloaded lookup",
)

rep(
    '''                    JSONObject current = null;
                    for (int i = 0; i < catalog.length(); i++) {
                        JSONObject candidate = catalog.optJSONObject(i);
                        if (candidate != null && slug.equals(candidate.optString("slug"))) { current = candidate; break; }
                    }
                    JSONObject release = current == null ? null : current.optJSONObject("release");''',
    '''                    JSONObject current = appForDownload(slug);
                    JSONObject release = current == null ? null : current.optJSONObject("release");''',
    "poll lookup",
)

rep(
    '                if (detailApp == null || !slug.equals(detailApp.optString("slug"))) return;',
    '''                boolean detailMatches = detailApp != null && slug.equals(detailApp.optString("slug"));
                boolean selfMatches = selfUpdateApp != null && slug.equals(selfUpdateApp.optString("slug"));
                if (!detailMatches && !selfMatches) return;''',
    "install result guard",
)

rep(
    '''                    consumeInstallResult(slug);
                    refreshDetail();
                    installResultPoll = null;''',
    '''                    consumeInstallResult(slug);
                    refreshDetail();
                    updateSelfUpdateUi();
                    installResultPoll = null;''',
    "install result ui",
)

rep(
    '''        if (installResultPoll != null) handler.removeCallbacks(installResultPoll);
        worker.shutdownNow(); super.onDestroy();''',
    '''        if (installResultPoll != null) handler.removeCallbacks(installResultPoll);
        if (selfUpdateUiPoll != null) handler.removeCallbacks(selfUpdateUiPoll);
        worker.shutdownNow(); super.onDestroy();''',
    "destroy self poll",
)

p.write_text(s)
