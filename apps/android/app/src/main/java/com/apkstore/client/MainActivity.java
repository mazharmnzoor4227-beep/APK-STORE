package com.apkstore.client;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.Dialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.database.Cursor;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.animation.ValueAnimator;
import android.util.LruCache;
import android.view.MotionEvent;
import android.view.ScaleGestureDetector;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.FrameLayout;
import android.view.Window;
import android.view.WindowInsets;
import android.view.animation.DecelerateInterpolator;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import androidx.work.WorkManager;
import androidx.work.PeriodicWorkRequest;
import androidx.work.ExistingPeriodicWorkPolicy;
import java.util.concurrent.TimeUnit;

public class MainActivity extends Activity {
    private static final int APPS = 0, SEARCH = 1, UPDATES = 2, FAVORITES = 3;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final ExecutorService iconWorker = Executors.newFixedThreadPool(6);
    private final LruCache<String, Bitmap> iconCache = new LruCache<>(32);
    private final HashMap<String, java.util.ArrayList<ImageView>> pendingIcons = new HashMap<>();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean light;
    private int tab = APPS;
    private int generation;
    private long lastCatalogRefresh;
    private String query = "", activeCategory = "";
    private String listCategory = "", listPrice = "All", listSearch = "";
    private int listCount = 30;
    private JSONArray catalog = new JSONArray();
    private CatalogRepository repository;
    private DownloadStore history;
    private SettingsStore settingsStore;
    private final HashMap<String, Long> releaseVersions = new HashMap<>();
    private LinearLayout body;
    private EditText searchBox;
    private Runnable pendingSearch;
    private boolean legalPage;
    private boolean firstScreen = true;
    private final HashMap<String, Long> downloads = new HashMap<>();
    private final HashMap<String, Long> completedDownloads = new HashMap<>();
    private final HashMap<String, String> downloadPaths = new HashMap<>();
    private final HashMap<String, Runnable> downloadPolls = new HashMap<>();
    private JSONObject detailApp;
    private TextView detailPrimary, detailSecondary, detailPercent, detailStatus;
    private ProgressRing detailRing;
    private FrameLayout detailIconContainer;
    private String pendingInstallSlug;
    private Runnable installResultPoll;
    private final HashMap<String, Integer> downloadProgress = new HashMap<>();
    private final HashMap<String, String> downloadSizes = new HashMap<>();
    private final HashMap<String, String> downloadErrors = new HashMap<>();
    private Typeface symbolTypeface;
    private final java.util.HashSet<String> previousHomeSlugs = new java.util.HashSet<>();
    private final long randomOrderSeed = new java.security.SecureRandom().nextLong();

    private class ProgressRing extends View {
        private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        private int percent;
        ProgressRing() { super(MainActivity.this); }
        void setProgress(int value) { percent = Math.max(0, Math.min(100, value)); invalidate(); }
        @Override protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            float stroke = dp(4), inset = stroke / 2 + dp(2);
            RectF oval = new RectF(inset, inset, getWidth() - inset, getHeight() - inset);
            paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(stroke); paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setColor(raised()); canvas.drawOval(oval, paint);
            paint.setColor(green());
            if (percent == 0 && getVisibility() == View.VISIBLE) {
                canvas.drawArc(oval, (android.os.SystemClock.uptimeMillis() / 5) % 360 - 90, 85, false, paint);
                postInvalidateDelayed(50);
            } else canvas.drawArc(oval, -90, 360f * percent / 100f, false, paint);
        }
    }

    private int bg() { return light ? Color.rgb(248, 248, 251) : Color.rgb(18, 18, 18); }
    private int surface() { return light ? Color.WHITE : Color.rgb(27, 27, 31); }
    private int raised() { return light ? Color.rgb(235, 235, 241) : Color.rgb(35, 35, 40); }
    private int green() { return light ? Color.rgb(69, 82, 157) : Color.rgb(183, 196, 255); }
    private int ink() { return light ? Color.rgb(28, 28, 34) : Color.rgb(230, 225, 229); }
    private int muted() { return light ? Color.rgb(97, 97, 108) : Color.rgb(169, 165, 173); }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        settingsStore = new SettingsStore(this);
        String theme = settingsStore.theme();
        light = "light".equals(theme) || ("system".equals(theme) &&
                (getResources().getConfiguration().uiMode & 0x30) == 0x10);
        repository = new CatalogRepository(this);
        history = new DownloadStore(this);
        JSONArray attempts = history.attempts();
        java.util.HashSet<String> recovered = new java.util.HashSet<>();
        for (int i = 0; i < attempts.length(); i++) {
            JSONObject attempt = attempts.optJSONObject(i);
            if (attempt == null || !recovered.add(attempt.optString("slug"))) continue;
            String slug = attempt.optString("slug"), status = attempt.optString("status");
            long id = attempt.optLong("id", -1);
            if (id <= 0) continue;
            if ("Downloading".equals(status)) downloads.put(slug, id);
            else if ("Downloaded".equals(status)) completedDownloads.put(slug, id);
            else continue;
            downloadPaths.put(slug, attempt.optString("path"));
        }
        catalog = repository.cached();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && app.optJSONObject("release") != null)
                releaseVersions.put(app.optString("package_id"), app.optJSONObject("release").optLong("version_code"));
        }
        showTab(APPS);
        for (String slug : new java.util.ArrayList<>(downloads.keySet())) pollDownload(slug);
        if (catalog.length() > 0) load();
        scheduleUpdates();
    }
    private void scheduleUpdates() {
        int hours = settingsStore.updateHours();
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(UpdateCheckWorker.class, hours, TimeUnit.HOURS).build();
        WorkManager.getInstance(this).enqueueUniquePeriodicWork("catalog-update-check", ExistingPeriodicWorkPolicy.UPDATE, request);
    }
    @Override protected void onResume() {
        super.onResume();
        handler.post(() -> {
            if (lastCatalogRefresh > 0 && android.os.SystemClock.elapsedRealtime() - lastCatalogRefresh > 15 * 60 * 1000L) load();
            if (detailApp != null) consumeInstallResult(detailApp.optString("slug"));
            if (detailApp != null) refreshDetail();
            if (detailApp != null && completedDownloads.containsKey(detailApp.optString("slug")))
                watchInstallResult(detailApp.optString("slug"));
            if (pendingInstallSlug != null && getPackageManager().canRequestPackageInstalls()) {
                String slug = pendingInstallSlug;
                pendingInstallSlug = null;
                openDownloaded(slug);
            }
        });
    }
    private void consumeInstallResult(String slug) {
        android.content.SharedPreferences prefs = getSharedPreferences(InstallResultReceiver.PREFS, MODE_PRIVATE);
        String result = prefs.getString(slug, null);
        if (result == null) return;
        prefs.edit().remove(slug).apply();
        if ("Installed".equals(result)) {
            downloadErrors.remove(slug);
            Long id = completedDownloads.remove(slug);
            if (id != null) {
                history.record(slug, slug, "Installed", "", id, "", 100);
                ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                downloadPaths.remove(slug);
            }
        } else {
            downloadErrors.put(slug, result);
            Long id = completedDownloads.get(slug);
            history.record(slug, slug, result.equals("Cancelled") ? "Cancelled" : "Failed", result,
                    id == null ? -1 : id, downloadPaths.getOrDefault(slug, ""), 100);
        }
    }
    private TextView text(String value, int size, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(value); t.setTextSize(size); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return t;
    }
    private GradientDrawable shape(int color, int radius) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color); d.setCornerRadius(dp(radius));
        return d;
    }
    private LinearLayout vertical() {
        LinearLayout l = new LinearLayout(this); l.setOrientation(LinearLayout.VERTICAL); return l;
    }
    private void space(LinearLayout l, int size) {
        l.addView(new View(this), new LinearLayout.LayoutParams(1, dp(size)));
    }
    private LinearLayout.LayoutParams weight() {
        return new LinearLayout.LayoutParams(0, -2, 1);
    }
    private TextView action(String glyph, String description) {
        String key = iconName(glyph);
        TextView t = symbol(key.isEmpty() ? glyph : key, 24, ink());
        t.setGravity(Gravity.CENTER); t.setContentDescription(description);
        return t;
    }
    private TextView symbol(String key, int size, int color) {
        int codepoint = MaterialSymbols.codepoint(key);
        TextView view = text(codepoint == 0 ? key : new String(Character.toChars(codepoint)), size, color, false);
        if (codepoint != 0) {
            if (symbolTypeface == null) symbolTypeface = Typeface.createFromAsset(getAssets(), "material_symbols_rounded.ttf");
            view.setTypeface(symbolTypeface);
        }
        view.setGravity(Gravity.CENTER);
        return view;
    }
    private String iconName(String glyph) {
        switch (glyph) {
            case "⌕": return "search"; case "⚙": return "settings";
            case "‹": return "arrow_back"; case "›": return "chevron_right";
            case "♥": case "♡": return "favorite";
            case "↗": return "share"; case "⋮": return "more_vert";
            case "×": return "close"; case "▦": case "▣": return "apps";
            case "⊘": return "cancel"; case "ⓘ": return "info";
            case "◷": return "download";
            default: return "";
        }
    }
    private String categoryIcon(String category) {
        switch (category) {
            case "All": return "done_all"; case "AI agents": return "smart_toy";
            case "Android Auto": return "directions_car"; case "Android TV": return "tv";
            case "Audio": return "graphic_eq"; case "Automation": return "bolt";
            case "Communication": return "chat_bubble"; case "Customization": return "palette";
            case "Development utilities": return "code"; case "Device owner (DPM)": return "admin_panel_settings";
            case "Display management": return "desktop_windows"; case "Entertainment": return "movie";
            case "File management": return "folder"; case "Games": return "sports_esports";
            case "Input methods": return "keyboard"; case "Installer & app stores": return "store";
            case "Miscellaneous": return "category"; case "Network": return "wifi";
            case "Patching": return "build"; case "Power management": return "battery_full";
            case "Privacy": return "lock"; case "Productivity": return "task_alt";
            case "Quick settings": return "tune"; case "Shizuku implementations": return "extension";
            case "Software management": return "settings_applications"; case "Task manager": return "list_alt";
            case "Terminals": return "terminal";
            case "Google Pixel": case "MIUI": case "Other": case "Samsung OneUI": return "smartphone";
            default: return "category";
        }
    }
    private int iconResource(String glyph) {
        switch (glyph) {
            case "⌕": return R.drawable.ic_search;
            case "⚙": return R.drawable.ic_settings;
            case "‹": return R.drawable.ic_back;
            case "›": return R.drawable.ic_chevron;
            case "♥": return R.drawable.ic_favorite;
            case "♡": return R.drawable.ic_favorite_border;
            case "↗": return R.drawable.ic_share;
            case "⋮": return R.drawable.ic_more;
            case "×": return R.drawable.ic_close;
            case "▦": return R.drawable.ic_apps;
            case "▣": return R.drawable.ic_apps;
            case "⊘": return R.drawable.ic_block;
            case "ⓘ": return R.drawable.ic_info;
            case "◷": return R.drawable.ic_download;
            default: return 0;
        }
    }
    private void tap(View view, Runnable next) {
        if (!ValueAnimator.areAnimatorsEnabled()) { next.run(); return; }
        view.animate().scaleX(.9f).scaleY(.9f).setDuration(85).withEndAction(() -> {
            view.animate().scaleX(1f).scaleY(1f).setDuration(160).start();
            next.run();
        }).start();
    }
    private void applySafeArea(LinearLayout root) {
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            int top, bottom;
            if (android.os.Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                top = bars.top; bottom = bars.bottom;
            } else {
                top = insets.getSystemWindowInsetTop();
                bottom = insets.getSystemWindowInsetBottom();
            }
            view.setPadding(0, top, 0, bottom);
            return insets;
        });
    }
    private void showTab(int selected) {
        detailApp = null;
        legalPage = false;
        tab = selected;
        getWindow().setStatusBarColor(bg());
        getWindow().setNavigationBarColor(bg());
        getWindow().getDecorView().setSystemUiVisibility(light ? View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR : 0);
        LinearLayout root = vertical(); root.setBackgroundColor(bg());
        // Android 15+ draws behind the system bars. Respect the real cutout and
        // gesture insets instead of guessing a fixed status bar height.
        applySafeArea(root);
        setContentView(root);
        root.requestApplyInsets();
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(16), dp(5), dp(10), dp(5));
        TextView title = text(selected == APPS ? "Apps" : selected == SEARCH ? "Search" : selected == FAVORITES ? "Favorites" : "Updates", 20, ink(), false);
        header.addView(title, weight());
        TextView find = action("⌕", "Search apps");
        find.setOnClickListener(v -> tap(v, () -> showTab(SEARCH)));
        header.addView(find, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView refresh = text("↻", 27, ink(), false);
        refresh.setGravity(Gravity.CENTER); refresh.setContentDescription("Refresh app catalog");
        refresh.setOnClickListener(v -> { refresh.animate().rotationBy(360).setDuration(500).start(); load(); });
        header.addView(refresh, new LinearLayout.LayoutParams(dp(44), dp(48)));
        ImageView download = new ImageView(this);
        download.setImageResource(com.apkstore.client.R.drawable.ic_download);
        download.setColorFilter(ink());
        download.setPadding(dp(12), dp(12), dp(12), dp(12));
        download.setContentDescription("Downloads");
        download.setOnClickListener(v -> tap(v, this::showDownloads));
        header.addView(download, new LinearLayout.LayoutParams(dp(48), dp(48)));
        TextView settings = action("⚙", "Settings");
        settings.setOnClickListener(v -> tap(v, this::settings));
        header.addView(settings, new LinearLayout.LayoutParams(dp(48), dp(48)));
        root.addView(header, new LinearLayout.LayoutParams(-1, dp(58)));

        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        body = vertical(); body.setPadding(dp(16), dp(7), dp(16), dp(24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout nav = new LinearLayout(this); nav.setGravity(Gravity.CENTER); nav.setBackgroundColor(surface());
        addNav(nav, "▦", "Apps", APPS);
        addNav(nav, "⌕", "Search", SEARCH);
        addNav(nav, "◷", "Updates", UPDATES);
        root.addView(nav, new LinearLayout.LayoutParams(-1, dp(76)));

        if (selected == SEARCH) {
            makeSearch();
        } else if (selected == UPDATES) {
            space(body, 16);
            JSONArray pending = pendingUpdates();
            body.addView(text(pending.length() + " update(s) available", 19, ink(), true));
            if (pending.length() > 0) {
                TextView all = text("Update all", 15, green(), true);
                all.setGravity(Gravity.CENTER); all.setMinHeight(dp(48));
                all.setOnClickListener(v -> { for (int i = 0; i < pending.length(); i++) startDownload(pending.optJSONObject(i)); });
                body.addView(all);
            }
            space(body, 18);
        }
        render();
        if (catalog.length() == 0) load();
        if (!firstScreen && ValueAnimator.areAnimatorsEnabled()) {
            header.setAlpha(0.65f); header.setTranslationY(-dp(8));
            header.animate().alpha(1f).translationY(0).setDuration(220).setInterpolator(new DecelerateInterpolator()).start();
            scroll.setAlpha(0f); scroll.setTranslationY(dp(12));
            scroll.animate().alpha(1f).translationY(0).setDuration(280).setInterpolator(new DecelerateInterpolator()).start();
            nav.setAlpha(0.85f); nav.animate().alpha(1f).setDuration(230).start();
        }
        firstScreen = false;
    }
    private void addNav(LinearLayout nav, String glyph, String title, int target) {
        LinearLayout item = vertical(); item.setGravity(Gravity.CENTER);
        TextView icon = symbol(iconName(glyph), 26, target == tab ? green() : muted());
        if (target == tab) {
            icon.setBackground(shape(raised(), 19));
            icon.setLayoutParams(new LinearLayout.LayoutParams(dp(72), dp(36)));
        }
        item.addView(icon);
        space(item, 3);
        int badge = target == UPDATES ? pendingUpdates().length() : 0;
        TextView caption = text(badge > 0 ? title + "  " + badge : title, 13, target == tab ? green() : muted(), target == tab);
        caption.setGravity(Gravity.CENTER); item.addView(caption);
        item.setOnClickListener(v -> { if (target != tab) { item.animate().scaleX(.93f).scaleY(.93f).setDuration(90).withEndAction(() -> showTab(target)).start(); } });
        nav.addView(item, new LinearLayout.LayoutParams(0, -1, 1));
    }
    private void makeSearch() {
        searchBox = new EditText(this);
        searchBox.setSingleLine(true); searchBox.setHint("Search apps");
        searchBox.setHintTextColor(muted()); searchBox.setTextColor(ink());
        searchBox.setTextSize(16); searchBox.setPadding(dp(17), dp(11), dp(17), dp(11));
        searchBox.setBackground(shape(surface(), 13)); searchBox.setText(query);
        body.addView(searchBox);
        space(body, 20);
        searchBox.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                query = s.toString();
                if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
                pendingSearch = () -> render();
                handler.postDelayed(pendingSearch, 250);
            }
            public void afterTextChanged(Editable e) {}
        });
        searchBox.setOnEditorActionListener((view, actionId, event) -> {
            if (!query.trim().isEmpty()) saveRecentSearch(query.trim());
            return false;
        });
    }
    private void load() {
        final int request = ++generation;
        worker.execute(() -> {
            try {
                if (BuildConfig.SUPABASE_KEY.isEmpty()) throw new Exception("Catalog connection is not configured.");
                JSONArray apps = repository.fetch();
                    HashMap<String, Long> versions = loadReleaseVersions(apps);
                    try { repository.save(apps); } catch (Exception ignored) { }
                    runOnUiThread(() -> { if (request == generation) {
                        boolean initial = catalog.length() == 0;
                        catalog = apps;
                        lastCatalogRefresh = android.os.SystemClock.elapsedRealtime();
                        releaseVersions.clear();
                        releaseVersions.putAll(versions);
                        if (initial && apps.length() > 0) showTab(tab); else render();
                    } });
            } catch (Exception error) {
                runOnUiThread(() -> { if (request == generation && body != null) {
                    if (catalog.length() == 0) {
                        render();
                        empty("Catalog unavailable", error.getMessage());
                        TextView retry = text("Retry", 16, green(), true);
                        retry.setMinHeight(dp(48)); retry.setOnClickListener(v -> load());
                        body.addView(retry);
                    }
                } });
            }
        });
    }
    private HashMap<String, Long> loadReleaseVersions(JSONArray apps) throws Exception {
        HashMap<String, String> packages = new HashMap<>();
        StringBuilder ids = new StringBuilder();
        for (int i = 0; i < apps.length(); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null) continue;
            String id = app.optString("current_release_id");
            if (!id.matches("[0-9a-fA-F-]{36}")) continue;
            packages.put(id, app.optString("package_id"));
            if (ids.length() > 0) ids.append(',');
            ids.append(id);
        }
        HashMap<String, Long> versions = new HashMap<>();
        if (ids.length() == 0) return versions;
        String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/releases?select=id,version_code,version_name,apk_sha256,byte_size,certificate_sha256,release_notes,changelog,permissions,published_at&status=eq.published&id=in.(" + ids + ")";
        HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
        connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
        connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
        try {
            if (connection.getResponseCode() != 200) throw new Exception("Release information temporarily unavailable.");
            try (InputStream stream = connection.getInputStream()) {
                JSONArray releases = new JSONArray(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                for (int i = 0; i < releases.length(); i++) {
                    JSONObject release = releases.optJSONObject(i);
                    if (release != null && packages.containsKey(release.optString("id"))) {
                        versions.put(packages.get(release.optString("id")), release.optLong("version_code"));
                        for (int j = 0; j < apps.length(); j++) {
                            JSONObject app = apps.optJSONObject(j);
                            if (app != null && release.optString("id").equals(app.optString("current_release_id"))) {
                                app.put("release", release); break;
                            }
                        }
                    }
                }
            }
            return versions;
        } finally { connection.disconnect(); }
    }
    private long installedVersion(String packageId) {
        if (packageId.isEmpty()) return -1;
        try {
            PackageInfo info = getPackageManager().getPackageInfo(packageId, 0);
            return android.os.Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
        } catch (PackageManager.NameNotFoundException ignored) {
            return -1;
        }
    }
    private boolean updateAvailable(JSONObject app) {
        String packageId = app.optString("package_id");
        long installed = installedVersion(packageId);
        Long latest = releaseVersions.get(packageId);
        return latest != null && UpdateLogic.available(installed, latest,
                settingsStore.contains("ignored", app.optString("slug")),
                settingsStore.contains("blacklist", app.optString("slug")));
    }
    private JSONArray pendingUpdates() {
        JSONArray apps = new JSONArray();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && updateAvailable(app)) apps.put(app);
        }
        return apps;
    }
    private void render() {
        if (body == null) return;
        if (tab == SEARCH) {
            while (body.getChildCount() > 2) body.removeViewAt(2);
            if (query.trim().isEmpty()) renderRecentSearches();
            renderList(filtered(query), false);
        } else if (tab == FAVORITES) {
            body.removeAllViews();
            renderList(favoriteApps(), false);
        } else if (tab == UPDATES) {
            while (body.getChildCount() > 0) body.removeViewAt(0);
            JSONArray pending = pendingUpdates();
            body.addView(text(pending.length() + " update(s) available", 20, ink(), true));
            if (pending.length() == 0) empty("You're up to date", "Installed catalog apps have no new releases.");
            else {
                TextView updateAll = text("Update all", 15, green(), true);
                updateAll.setMinHeight(dp(48)); updateAll.setOnClickListener(v -> {
                    for (int i = 0; i < pending.length(); i++) startDownload(pending.optJSONObject(i));
                }); body.addView(updateAll);
                for (int i = 0; i < pending.length(); i++) {
                    JSONObject app = pending.optJSONObject(i);
                    if (app != null) renderUpdateRow(app);
                }
            }
        } else {
            body.removeAllViews();
            if (catalog.length() == 0) { empty("The store is getting ready", "Approved apps will appear here."); return; }
            previousHomeSlugs.clear();
            homeSection("Recommended", "Recommended", listingApps("Recommended"), 8);
            homeSection("Recently added", "Recently added", catalog, 12);
            homeSection("Recently updated", "Recently updated", sortedUpdates(), 12);
            homeSection("Most starred on GitHub", "Most starred", sortedCatalog("stars"), 12);
            homeSection("Random picks", "Random picks", sortedCatalog("random"), 12);
        }
    }
    private void renderUpdateRow(JSONObject app) {
        String slug = app.optString("slug");
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(icon(app, 56), new LinearLayout.LayoutParams(dp(56), dp(56)));
        LinearLayout info = vertical(); info.setPadding(dp(12), 0, dp(8), 0);
        info.addView(text(app.optString("title"), 15, ink(), true));
        JSONObject release = app.optJSONObject("release");
        String size = release == null ? "" : String.format(java.util.Locale.ROOT, "%.1f MB", release.optLong("byte_size") / 1048576.0);
        String oldVersion = "Installed " + installedVersion(app.optString("package_id"));
        String newVersion = release == null ? "" : release.optString("version_name");
        info.addView(text(size + "  ·  " + oldVersion + " → " + newVersion, 12, muted(), false));
        row.addView(info, weight());
        TextView button = text(downloads.containsKey(slug) ? downloadProgress.getOrDefault(slug, 0) + "%" : "Update", 13, bg(), true);
        button.setGravity(Gravity.CENTER); button.setMinWidth(dp(70)); button.setMinHeight(dp(48));
        button.setBackground(shape(green(), 12));
        button.setOnClickListener(v -> { if (downloads.containsKey(slug)) showDetail(app); else startDownload(app); });
        row.addView(button); row.setOnClickListener(v -> showDetail(app));
        body.addView(row); space(body, 12);
    }
    private JSONArray filtered(String value) {
        JSONArray found = new JSONArray();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            String needle = value.trim().toLowerCase(java.util.Locale.ROOT);
            if (app != null && !blacklisted(app) && (needle.isEmpty() ||
                    (app.optString("title") + " " + app.optString("description") + " " + app.optString("package_id"))
                            .toLowerCase(java.util.Locale.ROOT).contains(needle))) found.put(app);
        }
        return found;
    }
    private boolean isFavorite(JSONObject app) {
        return settingsStore.contains("favorites", app.optString("slug"));
    }
    private boolean blacklisted(JSONObject app) {
        return settingsStore.contains("blacklist", app.optString("slug"));
    }
    private void toggleFavorite(JSONObject app) {
        java.util.Set<String> saved = settingsStore.entries("favorites");
        String slug = app.optString("slug");
        if (!saved.add(slug)) saved.remove(slug);
        settingsStore.setEntries("favorites", saved);
        showDetail(app);
    }
    private JSONArray favoriteApps() {
        JSONArray result = new JSONArray();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && isFavorite(app) && !blacklisted(app)) result.put(app);
        }
        return result;
    }
    private JSONArray sortedUpdates() {
        java.util.ArrayList<JSONObject> apps = new java.util.ArrayList<>();
        for (int i = 0; i < catalog.length(); i++) if (catalog.optJSONObject(i) != null && !blacklisted(catalog.optJSONObject(i))) apps.add(catalog.optJSONObject(i));
        apps.sort((a, b) -> {
            JSONObject ar = a.optJSONObject("release"), br = b.optJSONObject("release");
            String at = ar == null ? a.optString("updated_at") : ar.optString("published_at", a.optString("updated_at"));
            String bt = br == null ? b.optString("updated_at") : br.optString("published_at", b.optString("updated_at"));
            return bt.compareTo(at);
        });
        JSONArray result = new JSONArray();
        for (JSONObject app : apps) result.put(app);
        return result;
    }
    private JSONArray sortedCatalog(String mode) {
        java.util.ArrayList<JSONObject> apps = new java.util.ArrayList<>();
        for (int i = 0; i < catalog.length(); i++) if (catalog.optJSONObject(i) != null && !blacklisted(catalog.optJSONObject(i))) apps.add(catalog.optJSONObject(i));
        if ("recommended".equals(mode)) apps.sort((a, b) -> Boolean.compare(b.optBoolean("is_recommended"), a.optBoolean("is_recommended")));
        if ("stars".equals(mode)) apps.sort((a, b) -> Integer.compare(b.optInt("stars"), a.optInt("stars")));
        if ("random".equals(mode)) apps.sort((a, b) -> Long.compare(
                (a.optString("slug").hashCode() * 0x9E3779B97F4A7C15L) ^ randomOrderSeed,
                (b.optString("slug").hashCode() * 0x9E3779B97F4A7C15L) ^ randomOrderSeed));
        JSONArray result = new JSONArray();
        for (JSONObject app : apps) result.put(app);
        return result;
    }
    private void saveRecentSearch(String term) {
        android.content.SharedPreferences prefs = getPreferences(0);
        LinkedHashSet<String> terms = new LinkedHashSet<>(); terms.add(term);
        String prior = prefs.getString("recent_searches", "");
        for (String entry : prior.split("\\n")) if (!entry.isEmpty() && terms.size() < 8) terms.add(entry);
        prefs.edit().putString("recent_searches", String.join("\n", terms)).apply();
    }
    private void renderRecentSearches() {
        String saved = getPreferences(0).getString("recent_searches", "");
        if (saved.isEmpty()) return;
        LinearLayout row = new LinearLayout(this);
        row.addView(text("Recent searches", 16, ink(), true), weight());
        TextView clear = text("Clear", 14, green(), true); clear.setMinHeight(dp(48));
        clear.setOnClickListener(v -> { getPreferences(0).edit().remove("recent_searches").apply(); render(); });
        row.addView(clear); body.addView(row);
        for (String term : saved.split("\n")) {
            TextView item = text("◷  " + term, 15, muted(), false);
            item.setMinHeight(dp(48)); item.setOnClickListener(v -> searchBox.setText(term));
            body.addView(item);
        }
    }
    private void showDownloads() {
        LinearLayout page = informationPage("Downloads", () -> showTab(tab));
        JSONArray attempts = history.attempts();
        if (attempts.length() == 0) {
            page.addView(text("No downloads yet", 16, muted(), false)); return;
        }
        TextView clear = text("⋮  Clear history", 14, green(), true);
        clear.setMinHeight(dp(48)); clear.setOnClickListener(v -> { history.clear(); showDownloads(); });
        page.addView(clear);
        for (int i = 0; i < attempts.length(); i++) {
            JSONObject attempt = attempts.optJSONObject(i);
            if (attempt == null) continue;
            String slug = attempt.optString("slug");
            LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
            for (int j = 0; j < catalog.length(); j++) {
                JSONObject app = catalog.optJSONObject(j);
                if (app != null && slug.equals(app.optString("slug"))) {
                    row.addView(icon(app, 48), new LinearLayout.LayoutParams(dp(48), dp(48))); break;
                }
            }
            LinearLayout labels = vertical(); labels.setPadding(dp(12), 0, 0, 0);
            labels.addView(text(attempt.optString("title"), 16, ink(), true));
            String status = attempt.optString("status");
            if ("Downloading".equals(status)) status += " " + downloadProgress.getOrDefault(slug, attempt.optInt("progress")) + "%";
            labels.addView(text(status + " · " + android.text.format.DateFormat.format("dd MMM yyyy", attempt.optLong("time")), 12, muted(), false));
            if (!attempt.optString("error").isEmpty()) labels.addView(text(attempt.optString("error"), 12, muted(), false));
            row.addView(labels); row.setMinimumHeight(dp(72));
            if ("Failed".equals(attempt.optString("status")) || "Cancelled".equals(attempt.optString("status"))) {
                row.setContentDescription(attempt.optString("title") + ", " + attempt.optString("status") + ", tap to retry");
                row.setOnClickListener(v -> {
                    for (int j = 0; j < catalog.length(); j++) {
                        JSONObject app = catalog.optJSONObject(j);
                        if (app != null && slug.equals(app.optString("slug"))) { startDownload(app); showDownloads(); break; }
                    }
                });
            }
            page.addView(row);
        }
    }
    private void sectionTitle(String title, Runnable more) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(text(title, 17, ink(), true), weight());
        if (more != null) {
            TextView arrow = action("›", "View all " + title);
            arrow.setGravity(Gravity.CENTER); arrow.setContentDescription("View all " + title);
            arrow.setOnClickListener(v -> more.run());
            row.addView(arrow, new LinearLayout.LayoutParams(dp(40), dp(36)));
            row.setOnClickListener(v -> more.run());
        }
        body.addView(row); space(body, 10);
    }
    private void homeSection(String title, String listing, JSONArray apps, int limit) {
        if (apps.length() < 3) return;
        JSONArray unique = new JSONArray();
        for (int i = 0; i < apps.length(); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app != null && !previousHomeSlugs.contains(app.optString("slug"))) unique.put(app);
        }
        if (unique.length() >= 3) apps = unique;
        sectionTitle(title, () -> showListing(listing, false));
        if ("Most starred".equals(listing)) starShelf(apps, limit);
        else shelf(apps, limit);
        space(body, 22);
        previousHomeSlugs.clear();
        for (int i = 0; i < Math.min(limit, apps.length()); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app != null) previousHomeSlugs.add(app.optString("slug"));
        }
    }
    private void starShelf(JSONArray apps, int limit) {
        HorizontalScrollView scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout columns = new LinearLayout(this);
        for (int column = 0; column * 3 < Math.min(limit, apps.length()); column++) {
            LinearLayout group = vertical();
            for (int rowIndex = 0; rowIndex < 3 && column * 3 + rowIndex < Math.min(limit, apps.length()); rowIndex++) {
                JSONObject app = apps.optJSONObject(column * 3 + rowIndex);
                if (app == null || blacklisted(app)) continue;
                LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
                row.addView(icon(app, 48), new LinearLayout.LayoutParams(dp(48), dp(48)));
                LinearLayout copy = vertical(); copy.setPadding(dp(10), 0, 0, 0);
                TextView name = text(app.optString("title"), 14, ink(), true); name.setSingleLine(true); copy.addView(name);
                TextView description = text(app.optString("short_description"), 12, muted(), false);
                description.setSingleLine(true); description.setEllipsize(android.text.TextUtils.TruncateAt.END); copy.addView(description);
                JSONObject release = app.optJSONObject("release");
                String meta = "★ " + app.optInt("stars") + (release == null ? "" : " · " + release.optString("version_name") +
                        " · " + String.format(java.util.Locale.ROOT, "%.1f MB", release.optLong("byte_size") / 1048576.0));
                copy.addView(text(meta, 12, muted(), false));
                row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
                row.setMinimumHeight(dp(72)); row.setOnClickListener(v -> showDetail(app)); group.addView(row);
            }
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(260), -2);
            lp.setMargins(0, 0, dp(14), 0); columns.addView(group, lp);
        }
        scroller.addView(columns); body.addView(scroller);
    }
    private View icon(JSONObject app, int size) {
        String title = app.optString("title", "?");
        TextView fallback = text(title.isEmpty() ? "?" : title.substring(0, 1).toUpperCase(), size / 2, green(), true);
        fallback.setGravity(Gravity.CENTER); fallback.setBackground(shape(raised(), 13));
        String url = app.optString("icon_url", "");
        // icon_url is owner-controlled catalog data and may live on Supabase Storage,
        // the app-icon Edge Function, R2, F-Droid or GitHub. Require TLS, then rely on
        // the byte limit + Bitmap decode below instead of hard-coding an obsolete host.
        if (!url.startsWith("https://")) return fallback;
        android.widget.FrameLayout frame = new android.widget.FrameLayout(this);
        frame.addView(fallback, new android.widget.FrameLayout.LayoutParams(-1, -1));
        ImageView image = new ImageView(this);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setBackground(shape(raised(), 13));
        image.setClipToOutline(true);
        frame.addView(image, new android.widget.FrameLayout.LayoutParams(-1, -1));
        Bitmap cached = iconCache.get(url);
        File diskIcon = iconFile(url);
        if (cached == null && diskIcon.isFile()) {
            cached = BitmapFactory.decodeFile(diskIcon.getAbsolutePath());
            if (cached != null) iconCache.put(url, cached);
        }
        if (cached != null) image.setImageBitmap(cached);
        else {
            image.setVisibility(View.GONE);
            synchronized (pendingIcons) {
                java.util.ArrayList<ImageView> waiting = pendingIcons.get(url);
                if (waiting != null) { waiting.add(image); return frame; }
                waiting = new java.util.ArrayList<>(); waiting.add(image);
                pendingIcons.put(url, waiting);
            }
            iconWorker.execute(() -> {
                Bitmap loaded = null;
                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setConnectTimeout(8000); conn.setReadTimeout(8000);
                    if (conn.getResponseCode() == 200 && conn.getContentLengthLong() <= 1048576) {
                        byte[] bytes;
                        try (InputStream stream = conn.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                            byte[] buffer = new byte[8192]; int count;
                            while ((count = stream.read(buffer)) != -1) {
                                if (output.size() + count > 1048576) throw new Exception("Icon too large");
                                output.write(buffer, 0, count);
                            }
                            bytes = output.toByteArray();
                        }
                        loaded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                        if (loaded != null) {
                            try (FileOutputStream output = new FileOutputStream(diskIcon)) { output.write(bytes); }
                            iconCache.put(url, loaded);
                        }
                    }
                    conn.disconnect();
                } catch (Exception ignored) { }
                final Bitmap result = loaded;
                handler.post(() -> {
                    java.util.ArrayList<ImageView> waiting;
                    synchronized (pendingIcons) { waiting = pendingIcons.remove(url); }
                    if (result != null && waiting != null) for (ImageView target : waiting) {
                        target.setImageBitmap(result); target.setVisibility(View.VISIBLE);
                    }
                });
            });
        }
        return frame;
    }
    private File iconFile(String url) {
        File directory = new File(getCacheDir(), "app-icons");
        if (!directory.isDirectory()) directory.mkdirs();
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(url.getBytes(StandardCharsets.UTF_8));
            StringBuilder name = new StringBuilder();
            for (byte value : hash) name.append(String.format(java.util.Locale.ROOT, "%02x", value & 255));
            return new File(directory, name + ".img");
        } catch (Exception ignored) { return new File(directory, Integer.toHexString(url.hashCode()) + ".img"); }
    }
    private void shelf(JSONArray apps, int limit) {
        HorizontalScrollView scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        for (int i = 0; i < Math.min(apps.length(), limit); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null || blacklisted(app)) continue;
            LinearLayout tile = vertical(); tile.setGravity(Gravity.CENTER_HORIZONTAL);
            tile.addView(icon(app, 72), new LinearLayout.LayoutParams(dp(72), dp(72)));
            space(tile, 7);
            TextView title = text(app.optString("title"), 12, ink(), false);
            title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END);
            tile.addView(title);
            JSONObject release = app.optJSONObject("release");
            String size = release == null ? "" : String.format(java.util.Locale.ROOT, "%.1f MB", release.optLong("byte_size") / 1048576.0);
            TextView stats = text(size, 12, muted(), false);
            stats.setSingleLine(true); tile.addView(stats);
            tile.setOnClickListener(v -> showDetail(app));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(88), -2);
            params.setMargins(0, 0, dp(8), 0); row.addView(tile, params);
        }
        scroller.addView(row); body.addView(scroller);
    }
    private void renderList(JSONArray apps, boolean compact) {
        if (apps.length() == 0) {
            empty(tab == SEARCH ? "No matching apps" : tab == FAVORITES ? "No favorites yet" : "No apps published yet",
                    tab == SEARCH ? "Try another search term." : tab == FAVORITES ? "Tap the heart on an app to save it here." : "Approved releases will appear here.");
            return;
        }
        if (tab == SEARCH && query.trim().isEmpty()) {
            LinkedHashSet<String> names = new LinkedHashSet<>(java.util.Arrays.asList(
                    "All", "AI agents", "Android Auto", "Android TV", "Audio", "Automation", "Communication",
                    "Customization", "Development utilities", "Device owner (DPM)", "Display management", "Entertainment", "File management",
                    "Games", "Input methods", "Installer & app stores", "Miscellaneous", "Network", "Patching",
                    "Power management", "Privacy", "Productivity", "Quick settings", "Shizuku implementations",
                    "Software management", "Task manager", "Terminals", "Google Pixel", "MIUI", "Other", "Samsung OneUI"));
            LinearLayout rows = vertical();
            LinearLayout row = new LinearLayout(this); rows.addView(row);
            int width = 0;
            for (String name : names) {
                boolean selected = name.equals(activeCategory.isEmpty() ? "All" : activeCategory);
                LinearLayout chip = new LinearLayout(this); chip.setGravity(Gravity.CENTER_VERTICAL);
                chip.setPadding(dp(10), dp(8), dp(13), dp(8));
                chip.setMinimumHeight(dp(48));
                chip.addView(symbol(categoryIcon(name), 18, selected ? bg() : ink()), new LinearLayout.LayoutParams(dp(22), dp(22)));
                TextView caption = text(name, 12, selected ? bg() : ink(), true);
                caption.setPadding(dp(5), 0, 0, 0); chip.addView(caption);
                chip.setBackground(shape(selected ? green() : raised(), 16));
                int approximate = Math.min(250, 42 + name.length() * 8);
                int screen = Math.round(getResources().getDisplayMetrics().widthPixels / getResources().getDisplayMetrics().density) - 32;
                if (width > 0 && width + approximate > screen) {
                    row = new LinearLayout(this); rows.addView(row); width = 0;
                }
                width += approximate + 8;
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
                lp.setMargins(0, 0, dp(8), dp(8)); row.addView(chip, lp);
                chip.setOnClickListener(v -> { activeCategory = name.equals("All") ? "" : name; render(); });
            }
            body.addView(rows); space(body, 13);
        }
        int limit = compact ? Math.min(6, apps.length()) : apps.length();
        for (int i = 0; i < limit; i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null || blacklisted(app) || (!activeCategory.isEmpty() && !activeCategory.equals(app.optString("category")))) continue;
            LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(icon(app, 70), new LinearLayout.LayoutParams(dp(70), dp(70)));
            LinearLayout copy = vertical(); copy.setPadding(dp(11), 0, 0, 0);
            TextView title = text(app.optString("title"), 14, ink(), true); title.setSingleLine(true);
            copy.addView(title);
            TextView subtitle = text(updateAvailable(app) ? "UPDATE AVAILABLE" : app.optString("category") + "  ·  APK", 11, updateAvailable(app) ? green() : muted(), false);
            copy.addView(subtitle);
            row.addView(copy, weight());
            row.addView(text(updateAvailable(app) ? "Update ›" : "›", updateAvailable(app) ? 13 : 22, green(), updateAvailable(app)));
            row.setOnClickListener(v -> showDetail(app));
            body.addView(row); space(body, 12);
        }
    }
    private void empty(String title, String detail) {
        LinearLayout card = vertical(); card.setPadding(dp(18), dp(20), dp(18), dp(20));
        card.setBackground(shape(surface(), 15));
        card.addView(text(title, 18, ink(), true)); space(card, 7);
        card.addView(text(detail, 13, muted(), false)); body.addView(card);
    }
    private void showListing(String heading, boolean updates) {
        listCategory = ""; listPrice = "All"; listSearch = ""; listCount = 30;
        renderListing(heading);
    }
    private JSONArray listingApps(String heading) {
        if ("Recommended".equals(heading)) {
            JSONArray result = new JSONArray();
            for (int i = 0; i < catalog.length(); i++) {
                JSONObject app = catalog.optJSONObject(i);
                if (app != null && app.optBoolean("is_recommended") && !blacklisted(app)) result.put(app);
            }
            return result;
        }
        if ("Recently updated".equals(heading)) return sortedUpdates();
        if ("Most starred".equals(heading)) return sortedCatalog("stars");
        if ("Random picks".equals(heading)) return sortedCatalog("random");
        return catalog;
    }
    private void renderListing(String heading) {
        LinearLayout root = vertical(); root.setBackgroundColor(bg()); applySafeArea(root);
        setContentView(root); root.requestApplyInsets();
        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL); top.setPadding(dp(12), 0, dp(12), 0);
        TextView back = action("‹", "Back"); back.setOnClickListener(v -> showTab(APPS));
        top.addView(back, new LinearLayout.LayoutParams(dp(48), dp(56)));
        top.addView(text(heading, 22, ink(), true), weight());
        TextView search = action("⌕", "Search this list");
        search.setOnClickListener(v -> {
            EditText field = new EditText(this); field.setSingleLine(true); field.setText(listSearch);
            new AlertDialog.Builder(this).setTitle("Search " + heading).setView(field)
                    .setPositiveButton("Search", (d, w) -> { listSearch = field.getText().toString().trim(); listCount = 30; renderListing(heading); })
                    .setNegativeButton("Cancel", null).show();
        });
        top.addView(search, new LinearLayout.LayoutParams(dp(48), dp(56))); root.addView(top);
        HorizontalScrollView filters = new HorizontalScrollView(this); filters.setHorizontalScrollBarEnabled(false);
        LinearLayout chips = new LinearLayout(this); chips.setPadding(dp(16), dp(6), dp(16), dp(10));
        listingChip(chips, listCategory.isEmpty() ? "All" : listCategory, !listCategory.isEmpty(), () -> {
            java.util.LinkedHashSet<String> categories = new java.util.LinkedHashSet<>(java.util.Arrays.asList(
                    "All", "AI agents", "Android Auto", "Android TV", "Audio", "Automation", "Communication",
                    "Customization", "Development utilities", "Device owner (DPM)", "Display management", "Entertainment",
                    "File management", "Games", "Input methods", "Installer & app stores", "Miscellaneous", "Network",
                    "Patching", "Power management", "Privacy", "Productivity", "Quick settings",
                    "Shizuku implementations", "Software management", "Task manager", "Terminals",
                    "Google Pixel", "MIUI", "Other", "Samsung OneUI"));
            for (int i = 0; i < catalog.length(); i++) {
                JSONObject app = catalog.optJSONObject(i);
                if (app != null && !app.optString("category").isEmpty()) categories.add(app.optString("category"));
            }
            String[] choices = categories.toArray(new String[0]);
            showChoiceSheet("Filter by category", choices, listCategory.isEmpty() ? "All" : listCategory,
                    choice -> { listCategory = "All".equals(choice) ? "" : choice; listCount = 30; renderListing(heading); });
        });
        listingChip(chips, "Recently added", "Recently added".equals(heading), () -> showListing("Recently added", false));
        listingChip(chips, "Recommended", "Recommended".equals(heading), () -> showListing("Recommended", false));
        listingChip(chips, "Price" + ("All".equals(listPrice) ? "" : " · " + listPrice), !"All".equals(listPrice), () -> {
            String[] prices = {"All", "Free", "In-app purchases", "In-app purchases or Paid"};
            showChoiceSheet("Filter by price", prices, listPrice,
                    choice -> { listPrice = choice; listCount = 30; renderListing(heading); });
        });
        filters.addView(chips); root.addView(filters);
        ScrollView scroll = new ScrollView(this); root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout rows = vertical(); rows.setPadding(dp(16), dp(10), dp(16), dp(24)); scroll.addView(rows);
        JSONArray source = listingApps(heading); int matched = 0;
        for (int i = 0; i < source.length(); i++) {
            JSONObject app = source.optJSONObject(i);
            if (app == null || blacklisted(app) || (!listCategory.isEmpty() && !listCategory.equals(app.optString("category"))) ||
                    (!"All".equals(listPrice) && !listPrice.equals(app.optString("price_type")))) continue;
            String needle = listSearch.toLowerCase(java.util.Locale.ROOT);
            if (!needle.isEmpty() && !(app.optString("title") + " " + app.optString("description") + " " + app.optString("package_id"))
                    .toLowerCase(java.util.Locale.ROOT).contains(needle)) continue;
            matched++;
            if (matched > listCount) continue;
            LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setMinimumHeight(dp(80));
            row.addView(icon(app, 48), new LinearLayout.LayoutParams(dp(48), dp(48)));
            LinearLayout info = vertical(); info.setPadding(dp(12), 0, 0, 0);
            TextView name = text(app.optString("title"), 15, ink(), true); name.setSingleLine(true); info.addView(name);
            TextView description = text(app.optString("short_description", app.optString("description")), 12, muted(), false);
            description.setSingleLine(true); description.setEllipsize(android.text.TextUtils.TruncateAt.END); info.addView(description);
            JSONObject release = app.optJSONObject("release");
            String meta = release == null ? "" : release.optString("version_name") + " · " +
                    String.format(java.util.Locale.ROOT, "%.1f MB", release.optLong("byte_size") / 1048576.0);
            info.addView(text(meta, 12, muted(), false)); row.addView(info, weight());
            row.setOnClickListener(v -> showDetail(app)); rows.addView(row);
        }
        if (matched == 0) rows.addView(text("No matching apps. Try another filter or search term.", 15, muted(), false));
        if (matched > listCount) {
            TextView more = text("Load more", 15, green(), true); more.setGravity(Gravity.CENTER); more.setMinHeight(dp(56));
            more.setOnClickListener(v -> { listCount += 30; renderListing(heading); }); rows.addView(more);
        }
    }
    private void listingChip(LinearLayout row, String label, boolean selected, Runnable click) {
        TextView chip = text(label, 13, selected ? bg() : ink(), selected);
        chip.setGravity(Gravity.CENTER); chip.setPadding(dp(15), dp(8), dp(15), dp(8)); chip.setMinHeight(dp(48));
        chip.setBackground(shape(selected ? green() : raised(), 24)); chip.setOnClickListener(v -> click.run());
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2); lp.setMargins(0, 0, dp(8), 0); row.addView(chip, lp);
    }
    private void showChoiceSheet(String title, String[] choices, String selected, java.util.function.Consumer<String> onChoose) {
        Dialog sheet = new Dialog(this);
        LinearLayout panel = vertical(); panel.setBackground(shape(surface(), 28));
        panel.setPadding(dp(18), dp(8), dp(18), dp(16));
        TextView handle = text("━━━━", 17, muted(), false); handle.setGravity(Gravity.CENTER);
        handle.setMinHeight(dp(32)); panel.addView(handle);
        panel.addView(text(title, 20, ink(), true)); space(panel, 10);
        ScrollView scroll = new ScrollView(this); LinearLayout list = vertical();
        for (String choice : choices) {
            LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setMinimumHeight(dp(52));
            if ("Filter by category".equals(title))
                row.addView(symbol(categoryIcon(choice), 24, ink()), new LinearLayout.LayoutParams(dp(40), dp(48)));
            row.addView(text(choice, 15, ink(), false), weight());
            if (choice.equals(selected)) row.addView(text("✓", 19, green(), true));
            row.setOnClickListener(v -> { sheet.dismiss(); onChoose.accept(choice); }); list.addView(row);
        }
        scroll.addView(list); panel.addView(scroll, new LinearLayout.LayoutParams(-1, dp(Math.min(560, choices.length * 52))));
        sheet.setContentView(panel);
        Window window = sheet.getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.setGravity(Gravity.BOTTOM);
            window.setLayout(-1, -2);
        }
        sheet.show(); if (window != null) window.setLayout(-1, -2);
    }
    private void settings() {
        Dialog sheet = new Dialog(this);
        LinearLayout panel = vertical();
        panel.setPadding(dp(20), dp(15), dp(20), dp(24));
        panel.setBackground(shape(surface(), 24));
        TextView handle = text("━━━━", 19, muted(), false);
        handle.setGravity(Gravity.CENTER);
        handle.setContentDescription("Drag settings up or down; drag down to close");
        handle.setMinHeight(dp(46));
        panel.addView(handle);
        space(panel, 12);
        panel.addView(text("APK STORE", 19, ink(), true));
        space(panel, 14);
        ScrollView menuScroll = new ScrollView(this);
        menuScroll.setFillViewport(false);
        LinearLayout rows = vertical();
        sheetRow(rows, "▦", "Apps", () -> showTab(APPS), sheet);
        sheetRow(rows, "⌕", "Search", () -> showTab(SEARCH), sheet);
        sheetRow(rows, "◷", "Updates", () -> showTab(UPDATES), sheet);
        sheetRow(rows, "▣", "My apps", this::showMyApps, sheet);
        sheetRow(rows, "♡", "Favourites", () -> showTab(FAVORITES), sheet);
        sheetRow(rows, "⊘", "Blacklist", () -> showSavedApps("Blacklist", "blacklist"), sheet);
        sheetRow(rows, "◷", "Ignored updates", () -> showSavedApps("Ignored updates", "ignored"), sheet);
        sheetRow(rows, "⚙", "Settings", this::showSettings, sheet);
        sheetRow(rows, "♥", "Donate", () -> openLink("https://github.com/mazharmnzoor4227-beep/APK-STORE"), sheet);
        sheetRow(rows, "ⓘ", "About", this::showAbout, sheet);
        menuScroll.addView(rows);
        int sheetHeight = Math.min(dp(440), getResources().getDisplayMetrics().heightPixels / 2);
        panel.addView(menuScroll, new LinearLayout.LayoutParams(-1, Math.max(dp(170), sheetHeight - dp(135))));
        sheet.setContentView(panel);
        Window window = sheet.getWindow();
        if (window != null) {
            window.setBackgroundDrawableResource(android.R.color.transparent);
            window.addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            android.view.WindowManager.LayoutParams attributes = window.getAttributes();
            attributes.width = -1; attributes.height = -2;
            attributes.gravity = Gravity.BOTTOM;
            attributes.dimAmount = 0.55f;
            window.setAttributes(attributes);
        }
        sheet.show();
        if (window != null) window.setLayout(-1, -2);
        if (ValueAnimator.areAnimatorsEnabled()) {
            panel.post(() -> {
                panel.setTranslationY(panel.getHeight());
                panel.animate().translationY(0).setDuration(330).setInterpolator(new DecelerateInterpolator()).start();
            });
        }
        handle.setOnTouchListener(new View.OnTouchListener() {
            float startY;
            @Override public boolean onTouch(View view, MotionEvent event) {
                if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                    startY = event.getRawY(); panel.animate().cancel(); return true;
                }
                if (event.getActionMasked() == MotionEvent.ACTION_MOVE) {
                    float delta = event.getRawY() - startY;
                    panel.setTranslationY(Math.max(-dp(56), Math.min(panel.getHeight(), delta)));
                    return true;
                }
                if (event.getActionMasked() == MotionEvent.ACTION_UP || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                    if (panel.getTranslationY() > dp(90)) {
                        panel.animate().translationY(panel.getHeight()).setDuration(200).setInterpolator(new DecelerateInterpolator()).withEndAction(sheet::dismiss).start();
                    } else {
                        panel.animate().translationY(0).setDuration(260).setInterpolator(new DecelerateInterpolator()).start();
                    }
                    return true;
                }
                return false;
            }
        });
    }
    private void showMyApps() {
        LinearLayout page = informationPage("My apps", () -> showTab(tab));
        int count = 0;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && installedVersion(app.optString("package_id")) >= 0) {
                LinearLayout item = new LinearLayout(this); item.setGravity(Gravity.CENTER_VERTICAL); item.setMinimumHeight(dp(64));
                item.addView(icon(app, 44), new LinearLayout.LayoutParams(dp(44), dp(44)));
                TextView label = text(app.optString("title"), 16, ink(), true);
                label.setPadding(dp(12), 0, 0, 0); item.addView(label);
                item.setOnClickListener(v -> showDetail(app));
                page.addView(item); count++;
            }
        }
        if (count == 0) page.addView(text("No catalog apps installed", 15, muted(), false));
    }
    private void showSavedApps(String title, String key) {
        LinearLayout page = informationPage(title, () -> showTab(tab));
        java.util.Set<String> saved = settingsStore.entries(key);
        if (saved.isEmpty()) page.addView(text("No apps here", 15, muted(), false));
        for (String slug : saved) {
            JSONObject match = null;
            for (int i = 0; i < catalog.length(); i++) {
                JSONObject app = catalog.optJSONObject(i);
                if (app != null && slug.equals(app.optString("slug"))) { match = app; break; }
            }
            LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL); row.setMinimumHeight(dp(64));
            if (match != null) row.addView(icon(match, 44), new LinearLayout.LayoutParams(dp(44), dp(44)));
            TextView label = text(match == null ? slug : match.optString("title"), 16, ink(), true);
            label.setPadding(dp(12), 0, dp(12), 0); row.addView(label, weight());
            TextView remove = text("Remove", 14, green(), true); remove.setGravity(Gravity.CENTER);
            remove.setMinWidth(dp(72)); remove.setMinHeight(dp(48)); row.addView(remove);
            remove.setOnClickListener(v -> {
                java.util.Set<String> updated = new java.util.HashSet<>(saved);
                updated.remove(slug); settingsStore.setEntries(key, updated);
                showSavedApps(title, key);
            }); page.addView(row);
        }
    }
    private void showSettings() {
        LinearLayout page = informationPage("Settings", () -> showTab(tab));
        informationLink(page, "Theme", light ? "Light" : "Dark", () -> new AlertDialog.Builder(this)
                .setItems(new String[]{"System", "Dark", "Light"}, (dialog, which) -> {
                    settingsStore.setTheme(new String[]{"system", "dark", "light"}[which]);
                    light = which == 2 || (which == 0 && (getResources().getConfiguration().uiMode & 0x30) == 0x10);
                    showSettings();
                }).show());
        informationLink(page, "Update check interval", "Every 6 or 12 hours", () -> new AlertDialog.Builder(this)
                .setItems(new String[]{"6 hours", "12 hours"}, (dialog, which) -> {
                    settingsStore.setUpdateHours(which == 0 ? 6 : 12); scheduleUpdates(); showSettings();
                }).show());
        informationLink(page, "Clear catalog cache", "Reload listings from the network", () -> {
            new File(getFilesDir(), "catalog.json").delete(); load(); showSettings();
        });
    }
    private void sheetRow(LinearLayout panel, String glyph, String title, Runnable onClick, Dialog sheet) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView icon = action(glyph, title);
        row.addView(icon, new LinearLayout.LayoutParams(dp(43), dp(48)));
        row.addView(text(title, 16, ink(), false), weight());
        row.setPadding(dp(10), dp(12), dp(10), dp(12));
        row.setOnClickListener(v -> {
            sheet.dismiss();
            onClick.run();
        });
        panel.addView(row);
    }
    private LinearLayout informationPage(String title, Runnable backAction) {
        LinearLayout root = vertical(); root.setBackgroundColor(bg());
        applySafeArea(root); setContentView(root); root.requestApplyInsets();
        TextView back = text("‹  " + title, 20, ink(), true);
        back.setPadding(dp(18), dp(14), dp(18), dp(14));
        back.setOnClickListener(v -> backAction.run());
        root.addView(back);
        ScrollView scroll = new ScrollView(this);
        LinearLayout page = vertical();
        page.setPadding(dp(20), dp(16), dp(20), dp(36));
        scroll.addView(page); root.addView(scroll);
        return page;
    }
    private void showAbout() {
        legalPage = false;
        LinearLayout page = informationPage("About", () -> showTab(tab));
        page.addView(text("APK STORE", 28, ink(), true)); space(page, 8);
        page.addView(text("Independent Android apps, published after owner approval.", 15, muted(), false));
        space(page, 10);
        page.addView(text("Version " + BuildConfig.VERSION_NAME, 13, muted(), false));
        space(page, 26);
        informationLink(page, "Privacy Policy", "How this app handles data", () -> showLegal("Privacy Policy", privacyPolicy()));
        informationLink(page, "Terms of Use", "Downloads and use of the store", () -> showLegal("Terms of Use", termsOfUse()));
        informationLink(page, "Project and contact", "Open the GitHub repository", () -> openLink("https://github.com/mazharmnzoor4227-beep/APK-STORE"));
        informationLink(page, "Supabase privacy", "Hosting provider's notice", () -> openLink("https://supabase.com/privacy"));
    }
    private void openLink(String url) {
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }
    private void informationLink(LinearLayout page, String title, String subtitle, Runnable open) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
        row.setBackground(shape(surface(), 13)); row.setPadding(dp(16), dp(14), dp(16), dp(14));
        LinearLayout copy = vertical();
        copy.addView(text(title, 16, ink(), true)); space(copy, 4);
        copy.addView(text(subtitle, 12, muted(), false));
        row.addView(copy, weight()); row.addView(text("›", 25, green(), false));
        row.setOnClickListener(v -> open.run());
        page.addView(row); space(page, 12);
    }
    private void showLegal(String title, String content) {
        legalPage = true;
        LinearLayout page = informationPage(title, this::showAbout);
        TextView text = text(content, 15, ink(), false);
        text.setLineSpacing(dp(4), 1f);
        page.addView(text);
    }
    private String privacyPolicy() {
        return "Updated 27 September 2026\n\n"
                + "APK STORE lets you browse a public app catalog and download approved Android APK files. "
                + "This policy covers the APK STORE Android app.\n\n"
                + "What the app uses\n"
                + "The app requests internet access to load the catalog and download approved APKs into app-specific storage through Android Download Manager. "
                + "It checks installed app package IDs and version codes on your device to show available updates; that inventory is not sent to the catalog service. "
                + "Search text is filtered on your device. Your theme, favorites, recent searches and download history are stored on your device. "
                + "The app does not ask you to create an account and does not include advertising or analytics SDKs.\n\n"
                + "Service requests\n"
                + "When your device contacts the catalog or download service, the hosting provider may process technical request data such as an IP address, time and requested URL in its service logs. "
                + "APK downloads may be served through Supabase Storage or the publisher's trusted release host. See the providers' privacy notices for their practices.\n\n"
                + "Your choices\n"
                + "You can clear the catalog cache in Settings and download history on the Downloads screen. "
                + "Downloaded APKs are stored in APK STORE's app-specific files and removed after a successful install.\n\n"
                + "Questions\n"
                + "For questions about this app, contact the owner through the APK-STORE GitHub repository: github.com/mazharmnzoor4227-beep/APK-STORE.";
    }
    private String termsOfUse() {
        return "Updated 27 September 2026\n\n"
                + "APK STORE is a catalog for independent Android applications. "
                + "You may browse listings and download APK files that the owner has approved for publication.\n\n"
                + "Installing apps\n"
                + "Downloads run in the app through Android Download Manager. Android may ask you to approve installation from APK STORE. "
                + "Read an app's description and Android permission requests before installing it. "
                + "Apps listed here are separate software with their own features and terms.\n\n"
                + "Availability and updates\n"
                + "Listings and files may change or be removed. A newer APK may require the same package ID and signing certificate to install over an older release. "
                + "The catalog does not silently install or update apps.\n\n"
                + "Appropriate use\n"
                + "Do not abuse the download service or upload software that you do not have the right to distribute. "
                + "Publishing is subject to owner review.\n\n"
                + "Contact\n"
                + "Questions about APK STORE can be raised through github.com/mazharmnzoor4227-beep/APK-STORE.";
    }
    private void showDetail(JSONObject app) {
        consumeInstallResult(app.optString("slug"));
        detailApp = app;
        LinearLayout root = vertical(); root.setBackgroundColor(bg());
        applySafeArea(root); setContentView(root); root.requestApplyInsets();
        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = action("‹", "Back to Apps");
        back.setPadding(dp(16), dp(16), dp(16), dp(16));
        back.setOnClickListener(v -> { detailApp = null; showTab(tab); }); top.addView(back, new LinearLayout.LayoutParams(dp(64), dp(52)));
        top.addView(new View(this), new LinearLayout.LayoutParams(0, dp(52), 1));
        TextView heart = action(isFavorite(app) ? "♥" : "♡", "Toggle favorite");
        heart.setTextColor(isFavorite(app) ? green() : ink());
        heart.setFontVariationSettings(isFavorite(app) ? "'FILL' 1" : "'FILL' 0");
        heart.setOnClickListener(v -> toggleFavorite(app));
        top.addView(heart, new LinearLayout.LayoutParams(dp(56), dp(52)));
        TextView share = action("↗", "Share app");
        share.setOnClickListener(v -> {
            Intent intent = new Intent(Intent.ACTION_SEND).setType("text/plain")
                    .putExtra(Intent.EXTRA_TEXT, "https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site/  ·  " + app.optString("title"));
            startActivity(Intent.createChooser(intent, "Share app"));
        });
        top.addView(share, new LinearLayout.LayoutParams(dp(52), dp(52)));
        TextView more = action("⋮", "More app options");
        more.setOnClickListener(v -> new AlertDialog.Builder(this).setItems(new String[]{"Blacklist", "Ignore updates", "Open on GitHub"}, (dialog, which) -> {
            if (which == 2) {
                String url = app.optString("source_url");
                if (url.startsWith("https://github.com/")) openLink(url);
            } else {
                String key = which == 0 ? "blacklist" : "ignored";
                java.util.Set<String> values = settingsStore.entries(key);
                values.add(app.optString("slug")); settingsStore.setEntries(key, values);
                if (which == 0) showTab(tab); else refreshDetail();
            }
        }).show());
        top.addView(more, new LinearLayout.LayoutParams(dp(52), dp(52)));
        root.addView(top);
        ScrollView scroll = new ScrollView(this); root.addView(scroll);
        LinearLayout page = vertical(); page.setPadding(dp(20), dp(22), dp(20), dp(30)); scroll.addView(page);
        LinearLayout appHeader = new LinearLayout(this); appHeader.setGravity(Gravity.CENTER_VERTICAL);
        FrameLayout iconFrame = new FrameLayout(this);
        detailIconContainer = new FrameLayout(this);
        detailIconContainer.setBackground(shape(surface(), 16));
        detailIconContainer.setClipToOutline(true);
        detailIconContainer.addView(icon(app, 82), new FrameLayout.LayoutParams(-1, -1));
        iconFrame.addView(detailIconContainer, new FrameLayout.LayoutParams(dp(82), dp(82), Gravity.CENTER));
        detailRing = new ProgressRing();
        iconFrame.addView(detailRing, new FrameLayout.LayoutParams(dp(96), dp(96), Gravity.CENTER));
        appHeader.addView(iconFrame, new LinearLayout.LayoutParams(dp(96), dp(96)));
        LinearLayout identity = vertical(); identity.setPadding(dp(12), 0, 0, 0);
        TextView appName = text(app.optString("title"), 22, ink(), true);
        appName.setMaxLines(2); identity.addView(appName);
        identity.addView(text(app.optString("github_owner", "Developer"), 14, green(), false));
        JSONObject currentRelease = app.optJSONObject("release");
        identity.addView(text((currentRelease == null ? "" : currentRelease.optString("version_name") + " · ") + "GitHub", 12, muted(), false));
        appHeader.addView(identity, weight()); page.addView(appHeader);
        space(page, 20);
        detailPercent = text("", 13, green(), true); page.addView(detailPercent);
        detailStatus = text("", 12, muted(), false); page.addView(detailStatus); space(page, 9);
        LinearLayout actions = new LinearLayout(this); actions.setGravity(Gravity.CENTER_VERTICAL);
        detailPrimary = text("Install", 16, bg(), true);
        detailPrimary.setGravity(Gravity.CENTER); detailPrimary.setPadding(dp(14), dp(15), dp(14), dp(15));
        detailPrimary.setBackground(shape(green(), 12));
        detailPrimary.setOnClickListener(v -> {
            String slug = app.optString("slug");
            if (downloads.containsKey(slug)) cancelDownload(slug);
            else if (completedDownloads.containsKey(slug)) openDownloaded(slug);
            else startDownload(app);
            refreshDetail();
        });
        actions.addView(detailPrimary, new LinearLayout.LayoutParams(0, -2, 1));
        detailSecondary = text("", 14, ink(), true);
        detailSecondary.setGravity(Gravity.CENTER); detailSecondary.setPadding(dp(12), dp(15), dp(12), dp(15));
        actions.addView(detailSecondary, new LinearLayout.LayoutParams(0, -2, 1));
        page.addView(actions);
        TextView installNote = text("Android will ask you to confirm installation. Updates require the original signing certificate.", 12, muted(), false);
        installNote.setPadding(0, dp(8), 0, 0); page.addView(installNote);
        space(page, 24);
        JSONObject release = app.optJSONObject("release");
        String size = release == null ? "" : String.format(java.util.Locale.ROOT, "%.1f MB", release.optLong("byte_size") / 1048576.0);
        HorizontalScrollView chipScroll = new HorizontalScrollView(this);
        chipScroll.setHorizontalScrollBarEnabled(false);
        LinearLayout chipRow = new LinearLayout(this);
        detailChip(chipRow, "★ " + app.optInt("stars"));
        if (!app.optString("category").isEmpty()) detailChip(chipRow, app.optString("category"));
        if (!size.isEmpty()) detailChip(chipRow, size);
        int minSdk = app.optInt("min_sdk", 0);
        if (minSdk > 0) detailChip(chipRow, AndroidVersionLabel.forMinSdk(minSdk));
        String license = app.optString("license");
        if (!license.isEmpty()) detailChip(chipRow, license);
        chipScroll.addView(chipRow); page.addView(chipScroll);
        space(page, 20);
        expandable(page, "More about this app", app.optString("description"));
        if (release != null) expandable(page, "Changelog", release.optString("changelog", release.optString("release_notes")));
        JSONArray screenshots = app.optJSONArray("screenshots");
        if (screenshots != null && screenshots.length() > 0) {
            page.addView(text("Screenshots", 19, ink(), true));
            HorizontalScrollView strip = new HorizontalScrollView(this);
            LinearLayout tiles = new LinearLayout(this);
            for (int i = 0; i < screenshots.length(); i++) {
                String url = screenshots.optString(i);
                if (!trustedImage(url)) continue;
                ImageView preview = remoteImage(url);
                preview.setContentDescription("Screenshot " + (i + 1) + " of " + app.optString("title"));
                int index = i;
                preview.setOnClickListener(v -> showScreenshot(screenshots, index));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(140), dp(240));
                lp.setMargins(0, dp(12), dp(12), dp(18)); tiles.addView(preview, lp);
            }
            strip.addView(tiles); page.addView(strip);
        }
        if (app.optString("source_url").startsWith("https://"))
            informationLink(page, "Source code", app.optString("source_url"), () -> openLink(app.optString("source_url")));
        if (app.optString("fdroid_url").startsWith("https://"))
            informationLink(page, "F-Droid", app.optString("fdroid_url"), () -> openLink(app.optString("fdroid_url")));
        if (release != null) {
            JSONArray permissions = release.optJSONArray("permissions");
            StringBuilder permissionText = new StringBuilder();
            if (permissions != null) for (int i = 0; i < permissions.length(); i++)
                permissionText.append(permissions.optString(i)).append('\n');
            expandable(page, "Permissions · " + (permissions == null ? 0 : permissions.length()) + " requested",
                    permissionText.toString().trim());
            expandable(page, "Sources", "github".equals(release.optString("source")) ?
                    "✓ GitHub release (via APK STORE download gateway)" : "✓ Supabase storage");
        }
        JSONArray suggested = new JSONArray();
        for (int i = 0; i < catalog.length() && suggested.length() < 8; i++) {
            JSONObject candidate = catalog.optJSONObject(i);
            if (candidate != null && !candidate.optString("slug").equals(app.optString("slug")) &&
                    candidate.optString("category").equals(app.optString("category"))) suggested.put(candidate);
        }
        if (suggested.length() > 0) {
            space(page, 26); page.addView(text("More from this category", 19, ink(), true));
            HorizontalScrollView suggestions = new HorizontalScrollView(this);
            LinearLayout row = new LinearLayout(this);
            for (int i = 0; i < suggested.length(); i++) {
                JSONObject other = suggested.optJSONObject(i);
                if (other == null) continue;
                LinearLayout tile = vertical(); tile.addView(icon(other, 76), new LinearLayout.LayoutParams(dp(76), dp(76)));
                tile.addView(text(other.optString("title"), 12, ink(), true));
                tile.setOnClickListener(v -> showDetail(other));
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(98), -2);
                params.setMargins(0, dp(12), dp(10), 0); row.addView(tile, params);
            }
            suggestions.addView(row); page.addView(suggestions);
        }
        refreshDetail();
        if (downloads.containsKey(app.optString("slug"))) pollDownload(app.optString("slug"));
    }
    private void expandable(LinearLayout page, String title, String content) {
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        header.setMinimumHeight(dp(56));
        String key = title.startsWith("Changelog") ? "history" : title.startsWith("Permissions") ? "shield" :
                title.startsWith("Sources") ? "inventory_2" : "info";
        header.addView(symbol(key, 23, green()), new LinearLayout.LayoutParams(dp(40), dp(48)));
        header.addView(text(title, 16, ink(), true), weight());
        TextView chevron = symbol("expand_more", 22, muted());
        header.addView(chevron, new LinearLayout.LayoutParams(dp(40), dp(48)));
        TextView detail = text(content.isEmpty() ? "No information supplied" : content, 15, muted(), false);
        if ("Changelog".equals(title) && !content.isEmpty()) io.noties.markwon.Markwon.create(this).setMarkdown(detail, content);
        detail.setVisibility(View.GONE); detail.setPadding(0, dp(8), 0, dp(20));
        header.setOnClickListener(v -> {
            boolean expand = detail.getVisibility() == View.GONE;
            detail.setVisibility(expand ? View.VISIBLE : View.GONE);
            int codepoint = MaterialSymbols.codepoint(expand ? "expand_less" : "expand_more");
            chevron.setText(new String(Character.toChars(codepoint)));
        });
        page.addView(header); page.addView(detail);
    }
    private void detailChip(LinearLayout row, String value) {
        TextView chip = text(value, 12, ink(), false);
        chip.setGravity(Gravity.CENTER); chip.setPadding(dp(10), dp(5), dp(10), dp(5));
        chip.setMinHeight(dp(32)); chip.setBackground(shape(raised(), 8));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, dp(32));
        lp.setMargins(0, 0, dp(8), 0); row.addView(chip, lp);
    }
    private boolean trustedImage(String url) {
        return url.startsWith(BuildConfig.SUPABASE_URL + "/storage/v1/object/public/app-screenshots/") ||
                url.startsWith(BuildConfig.SUPABASE_URL + "/storage/v1/object/public/app-icons/") ||
                (url.startsWith("https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site/") && url.endsWith(".png"));
    }
    private ImageView remoteImage(String url) {
        ImageView image = new ImageView(this); image.setScaleType(ImageView.ScaleType.FIT_CENTER);
        image.setBackground(shape(surface(), 12));
        iconWorker.execute(() -> {
            try {
                String filename = java.util.UUID.nameUUIDFromBytes(url.getBytes(StandardCharsets.UTF_8)) + ".webp";
                File cached = new File(getCacheDir(), filename);
                if (cached.isFile() && cached.length() > 0 && cached.length() <= 5_000_000) {
                    Bitmap bitmap = BitmapFactory.decodeFile(cached.getAbsolutePath());
                    if (bitmap != null) { handler.post(() -> image.setImageBitmap(bitmap)); return; }
                }
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
                if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > 5000000) return;
                Bitmap bitmap;
                try (InputStream stream = connection.getInputStream(); java.io.FileOutputStream output = new java.io.FileOutputStream(cached)) {
                    byte[] bytes = new byte[8192]; int count; long total = 0;
                    while ((count = stream.read(bytes)) != -1) {
                        total += count;
                        if (total > 5_000_000) throw new java.io.IOException("Image too large");
                        output.write(bytes, 0, count);
                    }
                } catch (Exception error) { cached.delete(); throw error; }
                bitmap = BitmapFactory.decodeFile(cached.getAbsolutePath());
                if (bitmap != null) handler.post(() -> image.setImageBitmap(bitmap));
                connection.disconnect();
            } catch (Exception ignored) { }
        });
        return image;
    }
    private void showScreenshot(JSONArray screenshots, int index) {
        String url = screenshots.optString(index);
        if (!trustedImage(url)) return;
        Dialog viewer = new Dialog(this, android.R.style.Theme_Black_NoTitleBar_Fullscreen);
        ImageView image = remoteImage(url);
        ScaleGestureDetector detector = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector gesture) {
                float scale = Math.max(1f, Math.min(4f, image.getScaleX() * gesture.getScaleFactor()));
                image.setScaleX(scale); image.setScaleY(scale); return true;
            }
        });
        android.view.GestureDetector gestures = new android.view.GestureDetector(this,
                new android.view.GestureDetector.SimpleOnGestureListener() {
                    @Override public boolean onDoubleTap(MotionEvent event) {
                        float scale = image.getScaleX() > 1f ? 1f : 2f;
                        image.animate().scaleX(scale).scaleY(scale).setDuration(180).start(); return true;
                    }
                    @Override public boolean onFling(MotionEvent first, MotionEvent last, float velocityX, float velocityY) {
                        if (first == null || last == null || image.getScaleX() > 1.1f) return false;
                        float dx = last.getX() - first.getX(), dy = last.getY() - first.getY();
                        if (dy > dp(110) && Math.abs(dy) > Math.abs(dx)) { viewer.dismiss(); return true; }
                        if (Math.abs(dx) > dp(90) && Math.abs(dx) > Math.abs(dy)) {
                            int next = index + (dx < 0 ? 1 : -1);
                            if (next >= 0 && next < screenshots.length()) { viewer.dismiss(); showScreenshot(screenshots, next); }
                            return true;
                        }
                        return false;
                    }
                });
        image.setOnTouchListener((view, event) -> {
            detector.onTouchEvent(event); gestures.onTouchEvent(event); return true;
        });
        FrameLayout frame = new FrameLayout(this);
        frame.addView(image, new FrameLayout.LayoutParams(-1, -1));
        TextView close = action("×", "Close screenshot");
        close.setOnClickListener(v -> viewer.dismiss());
        frame.addView(close, new FrameLayout.LayoutParams(dp(56), dp(56), Gravity.TOP | Gravity.END));
        TextView position = text((index + 1) + " / " + screenshots.length(), 14, Color.WHITE, true);
        position.setPadding(dp(18), dp(15), dp(18), dp(15));
        frame.addView(position, new FrameLayout.LayoutParams(-2, -2, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL));
        if (index > 0) {
            TextView previous = action("‹", "Previous screenshot");
            previous.setOnClickListener(v -> { viewer.dismiss(); showScreenshot(screenshots, index - 1); });
            frame.addView(previous, new FrameLayout.LayoutParams(dp(56), dp(80), Gravity.CENTER_VERTICAL | Gravity.START));
        }
        if (index + 1 < screenshots.length()) {
            TextView next = action("›", "Next screenshot");
            next.setOnClickListener(v -> { viewer.dismiss(); showScreenshot(screenshots, index + 1); });
            frame.addView(next, new FrameLayout.LayoutParams(dp(56), dp(80), Gravity.CENTER_VERTICAL | Gravity.END));
        }
        viewer.setContentView(frame); viewer.show();
    }
    private void refreshDetail() {
        if (detailApp == null || detailPrimary == null) return;
        String slug = detailApp.optString("slug");
        boolean running = downloads.containsKey(slug);
        boolean ready = completedDownloads.containsKey(slug);
        boolean installed = installedVersion(detailApp.optString("package_id")) >= 0;
        detailRing.setVisibility(running ? View.VISIBLE : View.GONE);
        detailRing.setProgress(downloadProgress.getOrDefault(slug, 0));
        if (detailIconContainer != null) detailIconContainer.setBackground(shape(surface(), running ? 52 : 16));
        detailPercent.setText(running ? "Downloading " + downloadProgress.getOrDefault(slug, 0) + "%" : "");
        detailPercent.setVisibility(running ? View.VISIBLE : View.GONE);
        detailStatus.setText(downloadErrors.getOrDefault(slug,
                running ? downloadSizes.getOrDefault(slug, "Preparing download…") :
                        ready ? "Downloaded · Android will confirm installation" : ""));
        detailStatus.setVisibility(detailStatus.getText().length() == 0 ? View.GONE : View.VISIBLE);
        detailPrimary.setText(running ? "Open" : ready ? "Install" : updateAvailable(detailApp) ? "Update" : "Install");
        detailPrimary.setEnabled(!running);
        detailPrimary.setBackground(shape(running ? raised() : green(), 12));
        detailPrimary.setTextColor(running ? muted() : bg());
        detailSecondary.setVisibility(running || installed ? View.VISIBLE : View.GONE);
        detailSecondary.setText(running ? "Cancel" : "Uninstall");
        detailSecondary.setEnabled(true);
        detailSecondary.setBackground(shape(running ? surface() : bg(), 12));
        detailSecondary.setOnClickListener(v -> {
            if (running) cancelDownload(slug);
            else startActivity(new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + detailApp.optString("package_id"))));
        });
        if (installed && !running && !updateAvailable(detailApp)) {
            detailPrimary.setText("Open");
            detailPrimary.setOnClickListener(v -> {
                Intent launch = getPackageManager().getLaunchIntentForPackage(detailApp.optString("package_id"));
                if (launch != null) startActivity(launch);
                else { downloadErrors.put(slug, "This app has no launch screen."); refreshDetail(); }
            });
        } else {
            detailPrimary.setOnClickListener(v -> {
                if (downloads.containsKey(slug)) cancelDownload(slug);
                else if (completedDownloads.containsKey(slug)) openDownloaded(slug);
                else startDownload(detailApp);
                refreshDetail();
            });
        }
    }
    private void startDownload(JSONObject app) {
        String slug = app.optString("slug");
        if (!slug.matches("[a-z0-9]+(-[a-z0-9]+)*") || downloads.containsKey(slug)) return;
        try {
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            Uri url = Uri.parse(BuildConfig.SUPABASE_URL + "/functions/v1/download-apk?slug=" + Uri.encode(slug));
            DownloadManager.Request request = new DownloadManager.Request(url);
            request.setTitle(app.optString("title"));
            request.setDescription("Downloading APK in APK STORE");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            String filename = slug + "-" + System.currentTimeMillis() + ".apk";
            File directory = getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS);
            if (directory == null) throw new Exception("App storage is unavailable.");
            request.setDestinationInExternalFilesDir(this, android.os.Environment.DIRECTORY_DOWNLOADS, filename);
            long id = manager.enqueue(request);
            downloadPaths.put(slug, new File(directory, filename).getAbsolutePath());
            history.record(slug, app.optString("title"), "Downloading", "", id, downloadPaths.get(slug), 0);
            downloadErrors.remove(slug); downloadProgress.put(slug, 0);
            downloads.put(slug, id);
            pollDownload(slug); refreshDetail();
        } catch (Exception e) { downloadErrors.put(slug, "Download could not start: " + e.getMessage()); refreshDetail(); }
    }
    private void openDownloaded(String slug) {
        Long id = completedDownloads.get(slug);
        if (id == null) return;
        if (android.os.Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            pendingInstallSlug = slug;
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName())));
            return;
        }
        JSONObject app = null;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject candidate = catalog.optJSONObject(i);
            if (candidate != null && slug.equals(candidate.optString("slug"))) { app = candidate; break; }
        }
        if (app == null) { downloadErrors.put(slug, "Listing unavailable. Refresh the catalog."); refreshDetail(); return; }
        JSONObject release = app.optJSONObject("release");
        if (release == null) { downloadErrors.put(slug, "Release metadata unavailable. Refresh the catalog."); refreshDetail(); return; }
        String path = downloadPaths.get(slug);
        if (path == null) { downloadErrors.put(slug, "APK file is missing. Download again."); refreshDetail(); return; }
        final JSONObject target = app;
        worker.execute(() -> {
            try {
                File apk = new File(path);
                ApkIntegrity.verifyFile(apk, release.optString("apk_sha256"), release.optLong("byte_size"));
                ApkIntegrity.verifyPackage(this, apk, target.optString("package_id"), release.optString("certificate_sha256"));
                InstallCoordinator.install(this, apk, slug, target.optString("package_id"));
                runOnUiThread(() -> {
                    downloadErrors.put(slug, "Waiting for Android installation confirmation");
                    refreshDetail(); watchInstallResult(slug);
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    downloadErrors.put(slug, error.getMessage() == null ? "APK verification failed." : error.getMessage());
                    completedDownloads.remove(slug);
                    ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
                    refreshDetail();
                });
            }
        });
    }
    private void cancelDownload(String slug) {
        Long id = downloads.remove(slug);
        Runnable poll = downloadPolls.remove(slug);
        if (poll != null) handler.removeCallbacks(poll);
        if (id != null) ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
        downloadPaths.remove(slug);
        history.record(slug, slug, "Cancelled", "", id == null ? -1 : id, "", 0);
        downloadProgress.remove(slug); refreshDetail();
        downloadSizes.remove(slug);
    }
    private void pollDownload(String slug) {
        Runnable previous = downloadPolls.remove(slug);
        if (previous != null) handler.removeCallbacks(previous);
        Runnable poll = new Runnable() {
            @Override public void run() {
                Long id = downloads.get(slug);
                if (id == null) return;
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
                    if (cursor == null || !cursor.moveToFirst()) { cancelDownload(slug); return; }
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        downloads.remove(slug); downloadPolls.remove(slug);
                        completedDownloads.put(slug, id);
                        history.record(slug, slug, "Downloaded", "", id, downloadPaths.getOrDefault(slug, ""), 100);
                        downloadProgress.put(slug, 100);
                        refreshDetail();
                        openDownloaded(slug);
                        return;
                    }
                    if (status == DownloadManager.STATUS_FAILED) {
                        int reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON));
                        cancelDownload(slug); downloadErrors.put(slug, "Download failed (" + reason + "). Tap Install to retry.");
                        history.record(slug, slug, "Failed", downloadErrors.get(slug), id, "", 0);
                        refreshDetail(); return;
                    }
                    if (status == DownloadManager.STATUS_PAUSED)
                        downloadErrors.put(slug, "Paused · waiting for network or retry");
                    else if (status == DownloadManager.STATUS_RUNNING)
                        downloadErrors.remove(slug);
                    long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    JSONObject current = null;
                    for (int i = 0; i < catalog.length(); i++) {
                        JSONObject candidate = catalog.optJSONObject(i);
                        if (candidate != null && slug.equals(candidate.optString("slug"))) { current = candidate; break; }
                    }
                    JSONObject release = current == null ? null : current.optJSONObject("release");
                    long expected = release == null ? 0 : release.optLong("byte_size");
                    long progressTotal = total > 0 ? total : expected;
                    downloadProgress.put(slug, progressTotal > 0 ? (int)Math.min(99, done * 100 / progressTotal) : 0);
                    downloadSizes.put(slug, total > 0 ? String.format(java.util.Locale.ROOT,
                            "%.1f / %.1f MB", done / 1048576.0, total / 1048576.0) :
                            String.format(java.util.Locale.ROOT, "%.1f MB downloaded", done / 1048576.0));
                    refreshDetail();
                    if (detailApp == null && body != null) render();
                    handler.postDelayed(this, 500);
                } catch (Exception e) { cancelDownload(slug); downloadErrors.put(slug, "Download failed. Tap Install to retry."); refreshDetail(); }
            }
        };
        downloadPolls.put(slug, poll);
        handler.post(poll);
    }
    private void watchInstallResult(String slug) {
        if (installResultPoll != null) handler.removeCallbacks(installResultPoll);
        final long deadline = android.os.SystemClock.uptimeMillis() + 120000;
        installResultPoll = new Runnable() {
            @Override public void run() {
                if (detailApp == null || !slug.equals(detailApp.optString("slug"))) return;
                String result = getSharedPreferences(InstallResultReceiver.PREFS, MODE_PRIVATE).getString(slug, null);
                if (result != null) {
                    consumeInstallResult(slug);
                    refreshDetail();
                    installResultPoll = null;
                } else if (android.os.SystemClock.uptimeMillis() < deadline) {
                    handler.postDelayed(this, 700);
                } else installResultPoll = null;
            }
        };
        handler.postDelayed(installResultPoll, 700);
    }
    @Override public void onBackPressed() { if (legalPage) showAbout(); else showTab(APPS); }
    @Override protected void onDestroy() {
        if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
        for (Runnable poll : downloadPolls.values()) handler.removeCallbacks(poll);
        if (installResultPoll != null) handler.removeCallbacks(installResultPoll);
        worker.shutdownNow(); super.onDestroy();
    }
}
