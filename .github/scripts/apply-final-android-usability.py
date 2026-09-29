from pathlib import Path

p = Path('apps/android/app/src/main/java/com/apkstore/client/MainActivity.java')
s = p.read_text()

old = '''    private final java.util.HashSet<String> previousHomeSlugs = new java.util.HashSet<>();
    private final long randomOrderSeed = new java.security.SecureRandom().nextLong();
'''
new = '''    private final java.util.HashSet<String> previousHomeSlugs = new java.util.HashSet<>();
    private final long randomOrderSeed = new java.security.SecureRandom().nextLong();
    private final BulkUpdateQueue bulkUpdateQueue = new BulkUpdateQueue();
    private final HashMap<Integer, Integer> tabScrollY = new HashMap<>();
    private ScrollView activeTabScroll;
'''
if old not in s: raise SystemExit('field anchor missing')
s = s.replace(old, new, 1)

old = '''    private void showTab(int selected) {
        detailApp = null;
'''
new = '''    private void showTab(int selected) {
        if (activeTabScroll != null && detailApp == null) tabScrollY.put(tab, activeTabScroll.getScrollY());
        detailApp = null;
'''
if old not in s: raise SystemExit('showTab anchor missing')
s = s.replace(old, new, 1)

old = '''        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        body = vertical(); body.setPadding(dp(16), dp(7), dp(16), dp(24));
'''
new = '''        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        activeTabScroll = scroll;
        body = vertical(); body.setPadding(dp(16), dp(7), dp(16), dp(24));
'''
if old not in s: raise SystemExit('tab scroll anchor missing')
s = s.replace(old, new, 1)

old = '''                all.setGravity(Gravity.CENTER); all.setMinHeight(dp(48));
                all.setOnClickListener(v -> { for (int i = 0; i < pending.length(); i++) startDownload(pending.optJSONObject(i)); });
'''
new = '''                all.setGravity(Gravity.CENTER); all.setMinHeight(dp(48));
                all.setOnClickListener(v -> startUpdateAll(pending));
'''
if old not in s: raise SystemExit('first update all anchor missing')
s = s.replace(old, new, 1)

old = '''        render();
        if (catalog.length() == 0) load();
'''
new = '''        render();
        int restoreY = tabScrollY.getOrDefault(selected, 0);
        scroll.post(() -> scroll.scrollTo(0, restoreY));
        if (catalog.length() == 0) load();
'''
if old not in s: raise SystemExit('scroll restore anchor missing')
s = s.replace(old, new, 1)

old = '''                TextView updateAll = text("Update all", 15, green(), true);
                updateAll.setMinHeight(dp(48)); updateAll.setOnClickListener(v -> {
                    for (int i = 0; i < pending.length(); i++) startDownload(pending.optJSONObject(i));
                }); body.addView(updateAll);
'''
new = '''                TextView updateAll = text("Update all", 15, green(), true);
                updateAll.setMinHeight(dp(48)); updateAll.setOnClickListener(v -> startUpdateAll(pending));
                body.addView(updateAll);
'''
if old not in s: raise SystemExit('second update all anchor missing')
s = s.replace(old, new, 1)

old = '''            Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, "https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site/  ·  " + app.optString("title"));
'''
new = '''            String appUrl = "https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site/apps/" + Uri.encode(app.optString("slug"));
            Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, app.optString("title") + " · " + appUrl);
'''
if old not in s: raise SystemExit('share anchor missing')
s = s.replace(old, new, 1)

old = '''            if (!"Cancelled".equals(result))
                CrashReporter.recordHandled(this, "install_failed", result, new IllegalStateException(result));
        }
    }
'''
new = '''            if (!"Cancelled".equals(result))
                CrashReporter.recordHandled(this, "install_failed", result, new IllegalStateException(result));
        }
        finishBulkUpdate(slug);
    }
'''
if old not in s: raise SystemExit('install result anchor missing')
s = s.replace(old, new, 1)

old = '''        } catch (Exception e) {
            downloadErrors.put(slug, "Download could not start: " + e.getMessage());
            CrashReporter.recordHandled(this, "download_start_failed", downloadErrors.get(slug), e);
            refreshDetail();
        }
    }
'''
new = '''        } catch (Exception e) {
            downloadErrors.put(slug, "Download could not start: " + e.getMessage());
            CrashReporter.recordHandled(this, "download_start_failed", downloadErrors.get(slug), e);
            finishBulkUpdate(slug);
            refreshDetail();
        }
    }
'''
if old not in s: raise SystemExit('start failure anchor missing')
s = s.replace(old, new, 1)

old = '''        if (app == null) { downloadErrors.put(slug, "Listing unavailable. Refresh the catalog."); refreshDetail(); return; }
        JSONObject release = app.optJSONObject("release");
        if (release == null) { downloadErrors.put(slug, "Release metadata unavailable. Refresh the catalog."); refreshDetail(); return; }
        String path = downloadPaths.get(slug);
        if (path == null) { downloadErrors.put(slug, "APK file is missing. Download again."); refreshDetail(); return; }
'''
new = '''        if (app == null) { downloadErrors.put(slug, "Listing unavailable. Refresh the catalog."); finishBulkUpdate(slug); refreshDetail(); return; }
        JSONObject release = app.optJSONObject("release");
        if (release == null) { downloadErrors.put(slug, "Release metadata unavailable. Refresh the catalog."); finishBulkUpdate(slug); refreshDetail(); return; }
        String path = downloadPaths.get(slug);
        if (path == null) { downloadErrors.put(slug, "APK file is missing. Download again."); finishBulkUpdate(slug); refreshDetail(); return; }
'''
if old not in s: raise SystemExit('download metadata anchor missing')
s = s.replace(old, new, 1)

old = '''                    completedDownloads.remove(slug);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                    refreshDetail();
'''
new = '''                    completedDownloads.remove(slug);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                    finishBulkUpdate(slug);
                    refreshDetail();
'''
if old not in s: raise SystemExit('verification failure anchor missing')
s = s.replace(old, new, 1)

old = '''        downloadProgress.remove(slug); refreshDetail();
        downloadSizes.remove(slug);
    }
    private void pollDownload(String slug) {
'''
new = '''        downloadProgress.remove(slug); refreshDetail();
        downloadSizes.remove(slug);
        finishBulkUpdate(slug);
    }
    private void startUpdateAll(JSONArray pending) {
        java.util.ArrayList<String> slugs = new java.util.ArrayList<>();
        for (int i = 0; i < pending.length(); i++) {
            JSONObject app = pending.optJSONObject(i);
            if (app != null && !app.optString("slug").isBlank()) slugs.add(app.optString("slug"));
        }
        bulkUpdateQueue.reset(slugs);
        startNextBulkUpdate();
    }
    private void startNextBulkUpdate() {
        String slug = bulkUpdateQueue.startNext();
        if (slug == null) return;
        JSONObject app = null;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject candidate = catalog.optJSONObject(i);
            if (candidate != null && slug.equals(candidate.optString("slug"))) { app = candidate; break; }
        }
        if (app == null || !updateAvailable(app)) {
            bulkUpdateQueue.complete(slug);
            handler.post(this::startNextBulkUpdate);
            return;
        }
        startDownload(app);
    }
    private void finishBulkUpdate(String slug) {
        if (!bulkUpdateQueue.isActive(slug)) return;
        bulkUpdateQueue.complete(slug);
        handler.post(this::startNextBulkUpdate);
    }
    private void pollDownload(String slug) {
'''
if old not in s: raise SystemExit('cancel/bulk method anchor missing')
s = s.replace(old, new, 1)

old = '''                } else if (android.os.SystemClock.uptimeMillis() < deadline) {
                    handler.postDelayed(this, 700);
                } else installResultPoll = null;
'''
new = '''                } else if (android.os.SystemClock.uptimeMillis() < deadline) {
                    handler.postDelayed(this, 700);
                } else {
                    installResultPoll = null;
                    finishBulkUpdate(slug);
                }
'''
if old not in s: raise SystemExit('install timeout anchor missing')
s = s.replace(old, new, 1)

p.write_text(s)
