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
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.database.Cursor;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.view.Window;
import android.view.WindowInsets;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.TranslateAnimation;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int APPS = 0, SEARCH = 1, UPDATES = 2, FAVORITES = 3;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private boolean light;
    private int tab = APPS;
    private int generation;
    private String query = "", activeCategory = "";
    private JSONArray catalog = new JSONArray();
    private final HashMap<String, Long> releaseVersions = new HashMap<>();
    private LinearLayout body;
    private EditText searchBox;
    private Runnable pendingSearch;
    private boolean legalPage;
    private final HashMap<String, Long> downloads = new HashMap<>();
    private final HashMap<String, Long> completedDownloads = new HashMap<>();
    private final HashMap<String, Runnable> downloadPolls = new HashMap<>();

    private int bg() { return light ? Color.rgb(247, 250, 247) : Color.rgb(9, 12, 10); }
    private int surface() { return light ? Color.WHITE : Color.rgb(23, 27, 24); }
    private int raised() { return light ? Color.rgb(235, 243, 236) : Color.rgb(34, 43, 36); }
    private int green() { return light ? Color.rgb(24, 118, 60) : Color.rgb(118, 238, 145); }
    private int ink() { return light ? Color.rgb(21, 33, 24) : Color.rgb(240, 246, 240); }
    private int muted() { return light ? Color.rgb(93, 107, 95) : Color.rgb(152, 164, 153); }
    private int dp(int n) { return Math.round(n * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        light = getPreferences(0).getBoolean("light", false);
        showTab(APPS);
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
        TextView t = text(glyph, 23, ink(), false);
        t.setGravity(Gravity.CENTER); t.setContentDescription(description);
        return t;
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
        TextView favorites = action("♡", "Favorites");
        favorites.setOnClickListener(v -> showTab(FAVORITES));
        header.addView(favorites, new LinearLayout.LayoutParams(dp(46), dp(48)));
        TextView find = action("⌕", "Search apps");
        find.setOnClickListener(v -> showTab(SEARCH));
        header.addView(find, new LinearLayout.LayoutParams(dp(46), dp(48)));
        ImageView download = new ImageView(this);
        download.setImageResource(com.apkstore.client.R.drawable.ic_download);
        download.setColorFilter(ink());
        download.setPadding(dp(12), dp(12), dp(12), dp(12));
        download.setContentDescription("Latest releases");
        download.setOnClickListener(v -> showTab(UPDATES));
        header.addView(download, new LinearLayout.LayoutParams(dp(46), dp(48)));
        TextView settings = action("⚙", "Settings");
        settings.setOnClickListener(v -> settings());
        header.addView(settings, new LinearLayout.LayoutParams(dp(46), dp(48)));
        root.addView(header, new LinearLayout.LayoutParams(-1, dp(58)));

        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true);
        body = vertical(); body.setPadding(dp(16), dp(7), dp(16), dp(24));
        scroll.addView(body);
        root.addView(scroll, new LinearLayout.LayoutParams(-1, 0, 1));
        LinearLayout nav = new LinearLayout(this); nav.setGravity(Gravity.CENTER); nav.setBackgroundColor(surface());
        addNav(nav, "▦", "Apps", APPS);
        addNav(nav, "⌕", "Search", SEARCH);
        addNav(nav, "◷", "Updates", UPDATES);
        addNav(nav, "♡", "Favorites", FAVORITES);
        root.addView(nav, new LinearLayout.LayoutParams(-1, dp(76)));

        if (selected == SEARCH) {
            makeSearch();
        } else if (selected == UPDATES) {
            space(body, 16);
            sectionTitle("Latest releases", null);
            body.addView(text("New and updated apps approved for APK STORE.", 14, muted(), false));
            space(body, 18);
        }
        render();
        if (catalog.length() == 0) load();
    }
    private void addNav(LinearLayout nav, String glyph, String title, int target) {
        LinearLayout item = vertical(); item.setGravity(Gravity.CENTER);
        TextView icon = text(glyph, 26, target == tab ? green() : muted(), false);
        icon.setGravity(Gravity.CENTER);
        if (target == tab) {
            icon.setBackground(shape(raised(), 19));
            icon.setLayoutParams(new LinearLayout.LayoutParams(dp(72), dp(36)));
        }
        item.addView(icon);
        space(item, 3);
        TextView caption = text(title, 13, target == tab ? green() : muted(), target == tab);
        caption.setGravity(Gravity.CENTER); item.addView(caption);
        item.setOnClickListener(v -> { if (target != tab) showTab(target); });
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
                query = s.toString(); activeCategory = "";
                if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
                pendingSearch = () -> render();
                handler.postDelayed(pendingSearch, 180);
            }
            public void afterTextChanged(Editable e) {}
        });
    }
    private void load() {
        final int request = ++generation;
        worker.execute(() -> {
            try {
                if (BuildConfig.SUPABASE_KEY.isEmpty()) throw new Exception("Catalog connection is not configured.");
                String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/apps?select=id,slug,title,package_id,category,description,current_release_id,created_at,updated_at&visibility=eq.published&current_release_id=not.is.null&order=created_at.desc&limit=100";
                HttpURLConnection connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setConnectTimeout(12000); connection.setReadTimeout(12000);
                connection.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
                connection.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
                if (connection.getResponseCode() != 200) throw new Exception("Catalog temporarily unavailable.");
                try (InputStream stream = connection.getInputStream()) {
                    JSONArray apps = new JSONArray(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                    HashMap<String, Long> versions = loadReleaseVersions(apps);
                    runOnUiThread(() -> { if (request == generation) {
                        catalog = apps;
                        releaseVersions.clear();
                        releaseVersions.putAll(versions);
                        render();
                    } });
                } finally { connection.disconnect(); }
            } catch (Exception error) {
                runOnUiThread(() -> { if (request == generation && body != null) {
                    body.removeAllViews();
                    body.addView(text(error.getMessage(), 15, muted(), false));
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
        String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/releases?select=id,version_code&status=eq.published&id=in.(" + ids + ")&limit=100";
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
                    if (release != null && packages.containsKey(release.optString("id")))
                        versions.put(packages.get(release.optString("id")), release.optLong("version_code"));
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
        return installed >= 0 && latest != null && latest > installed;
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
            renderList(filtered(query), false);
        } else if (tab == FAVORITES) {
            body.removeAllViews();
            renderList(favoriteApps(), false);
        } else if (tab == UPDATES) {
            while (body.getChildCount() > 5) body.removeViewAt(5);
            JSONArray pending = pendingUpdates();
            if (pending.length() > 0) {
                sectionTitle("Updates for your apps", null);
                renderList(pending, false);
                space(body, 20);
            }
            renderList(sortedUpdates(), false);
        } else {
            body.removeAllViews();
            if (catalog.length() == 0) { empty("The store is getting ready", "Approved apps will appear here."); return; }
            sectionTitle("Recommended", null);
            shelf(catalog, 8);
            space(body, 22);
            sectionTitle("Recently added", () -> showListing("Recently added", false));
            shelf(catalog, 12);
            space(body, 22);
            sectionTitle("Recently updated", () -> showListing("Recently updated", true));
            JSONArray updated = sortedUpdates();
            shelf(updated, 12);
            space(body, 22);
            sectionTitle("Explore all apps", () -> showListing("All apps", false));
            renderList(catalog, true);
        }
    }
    private JSONArray filtered(String value) {
        JSONArray found = new JSONArray();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && (value.trim().isEmpty() || app.optString("title").toLowerCase().contains(value.trim().toLowerCase())
                    || app.optString("category").toLowerCase().contains(value.trim().toLowerCase()))) found.put(app);
        }
        return found;
    }
    private boolean isFavorite(JSONObject app) {
        return getPreferences(0).getStringSet("favorites", java.util.Collections.emptySet()).contains(app.optString("slug"));
    }
    private void toggleFavorite(JSONObject app) {
        java.util.Set<String> saved = new java.util.HashSet<>(getPreferences(0).getStringSet("favorites", java.util.Collections.emptySet()));
        String slug = app.optString("slug");
        if (!saved.add(slug)) saved.remove(slug);
        getPreferences(0).edit().putStringSet("favorites", saved).apply();
        showDetail(app);
    }
    private JSONArray favoriteApps() {
        JSONArray result = new JSONArray();
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject app = catalog.optJSONObject(i);
            if (app != null && isFavorite(app)) result.put(app);
        }
        return result;
    }
    private JSONArray sortedUpdates() {
        java.util.ArrayList<JSONObject> apps = new java.util.ArrayList<>();
        for (int i = 0; i < catalog.length(); i++) if (catalog.optJSONObject(i) != null) apps.add(catalog.optJSONObject(i));
        apps.sort((a, b) -> b.optString("updated_at").compareTo(a.optString("updated_at")));
        JSONArray result = new JSONArray();
        for (JSONObject app : apps) result.put(app);
        return result;
    }
    private void sectionTitle(String title, Runnable more) {
        LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
        row.addView(text(title, 17, ink(), true), weight());
        if (more != null) {
            TextView arrow = text("›", 26, muted(), false);
            arrow.setGravity(Gravity.CENTER); arrow.setContentDescription("View all " + title);
            arrow.setOnClickListener(v -> more.run());
            row.addView(arrow, new LinearLayout.LayoutParams(dp(40), dp(36)));
            row.setOnClickListener(v -> more.run());
        }
        body.addView(row); space(body, 10);
    }
    private TextView icon(JSONObject app, int size) {
        String title = app.optString("title", "?");
        TextView icon = text(title.isEmpty() ? "?" : title.substring(0, 1).toUpperCase(), size / 2, green(), true);
        icon.setGravity(Gravity.CENTER); icon.setBackground(shape(raised(), 13));
        return icon;
    }
    private void shelf(JSONArray apps, int limit) {
        HorizontalScrollView scroller = new HorizontalScrollView(this);
        scroller.setHorizontalScrollBarEnabled(false);
        LinearLayout row = new LinearLayout(this);
        for (int i = 0; i < Math.min(apps.length(), limit); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null) continue;
            LinearLayout tile = vertical(); tile.setGravity(Gravity.CENTER_HORIZONTAL);
            tile.addView(icon(app, 58), new LinearLayout.LayoutParams(dp(58), dp(58)));
            space(tile, 7);
            TextView title = text(app.optString("title"), 12, ink(), false);
            title.setSingleLine(true); title.setEllipsize(android.text.TextUtils.TruncateAt.END);
            tile.addView(title);
            TextView category = text(updateAvailable(app) ? "UPDATE AVAILABLE" : app.optString("category"), 10, updateAvailable(app) ? green() : muted(), false);
            category.setSingleLine(true); tile.addView(category);
            tile.setOnClickListener(v -> showDetail(app));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(dp(84), -2);
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
            LinkedHashSet<String> names = new LinkedHashSet<>(); names.add("All");
            for (int i = 0; i < apps.length(); i++) names.add(apps.optJSONObject(i).optString("category"));
            HorizontalScrollView scroller = new HorizontalScrollView(this);
            scroller.setHorizontalScrollBarEnabled(false);
            LinearLayout row = new LinearLayout(this);
            for (String name : names) {
                boolean selected = name.equals(activeCategory.isEmpty() ? "All" : activeCategory);
                TextView chip = text(name, 12, selected ? bg() : ink(), true);
                chip.setPadding(dp(13), dp(8), dp(13), dp(8));
                chip.setBackground(shape(selected ? green() : raised(), 16));
                LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-2, -2);
                lp.setMargins(0, 0, dp(8), 0); row.addView(chip, lp);
                chip.setOnClickListener(v -> { activeCategory = name.equals("All") ? "" : name; render(); });
            }
            scroller.addView(row); body.addView(scroller); space(body, 13);
        }
        int limit = compact ? Math.min(6, apps.length()) : apps.length();
        for (int i = 0; i < limit; i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null || (!activeCategory.isEmpty() && !activeCategory.equals(app.optString("category")))) continue;
            LinearLayout row = new LinearLayout(this); row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(icon(app, 48), new LinearLayout.LayoutParams(dp(48), dp(48)));
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
        tab = updates ? UPDATES : SEARCH;
        showTab(tab);
        if (!updates && searchBox != null) searchBox.setHint(heading + " · Search apps");
    }
    private void settings() {
        Dialog sheet = new Dialog(this);
        LinearLayout panel = vertical();
        panel.setPadding(dp(20), dp(15), dp(20), dp(24));
        panel.setBackground(shape(surface(), 24));
        TextView handle = text("━━━━", 19, muted(), false);
        handle.setGravity(Gravity.CENTER);
        panel.addView(handle);
        space(panel, 12);
        panel.addView(text("APK STORE", 19, ink(), true));
        space(panel, 14);
        sheetRow(panel, "▦", "Apps", () -> showTab(APPS), sheet);
        sheetRow(panel, "⌕", "Search", () -> showTab(SEARCH), sheet);
        sheetRow(panel, "◷", "Updates", () -> showTab(UPDATES), sheet);
        sheetRow(panel, "♡", "Favorites", () -> showTab(FAVORITES), sheet);
        sheetRow(panel, light ? "☾" : "☀", light ? "Dark mode" : "Light mode", () -> {
            light = !light;
            getPreferences(0).edit().putBoolean("light", light).apply();
            showTab(tab);
        }, sheet);
        sheetRow(panel, "ⓘ", "About", this::showAbout, sheet);
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
        TranslateAnimation slide = new TranslateAnimation(0, 0, dp(360), 0);
        slide.setDuration(280);
        slide.setInterpolator(new DecelerateInterpolator());
        panel.startAnimation(slide);
    }
    private void sheetRow(LinearLayout panel, String glyph, String title, Runnable onClick, Dialog sheet) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView icon = text(glyph, 22, green(), false);
        row.addView(icon, new LinearLayout.LayoutParams(dp(43), -2));
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
                + "The app requests internet access to load the catalog and download approved APKs through Android Download Manager. "
                + "It checks installed app package IDs and version codes on your device to show available updates; that inventory is not sent to the catalog service. "
                + "Search text is filtered on your device. Your theme and favorites are stored on your device. "
                + "The app does not ask you to create an account and does not include advertising or analytics SDKs.\n\n"
                + "Service requests\n"
                + "When your device contacts the catalog or download service, the hosting provider may process technical request data such as an IP address, time and requested URL in its service logs. "
                + "APK downloads may be served through Supabase Storage or the publisher's trusted release host. See the providers' privacy notices for their practices.\n\n"
                + "Your choices\n"
                + "You can clear the saved theme preference by clearing APK STORE app data or uninstalling it. "
                + "Downloaded APKs are managed by Android Download Manager; you can remove them in your device's Downloads app.\n\n"
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
        LinearLayout root = vertical(); root.setBackgroundColor(bg());
        applySafeArea(root); setContentView(root); root.requestApplyInsets();
        LinearLayout top = new LinearLayout(this); top.setGravity(Gravity.CENTER_VERTICAL);
        TextView back = text("‹  Back", 17, ink(), false);
        back.setPadding(dp(16), dp(16), dp(16), dp(16));
        back.setOnClickListener(v -> showTab(tab)); top.addView(back, weight());
        TextView heart = action(isFavorite(app) ? "♥" : "♡", "Toggle favorite");
        heart.setTextColor(isFavorite(app) ? green() : ink());
        heart.setOnClickListener(v -> toggleFavorite(app));
        top.addView(heart, new LinearLayout.LayoutParams(dp(56), dp(52)));
        root.addView(top);
        ScrollView scroll = new ScrollView(this); root.addView(scroll);
        LinearLayout page = vertical(); page.setPadding(dp(20), dp(22), dp(20), dp(30)); scroll.addView(page);
        page.addView(icon(app, 84), new LinearLayout.LayoutParams(dp(84), dp(84)));
        space(page, 17);
        page.addView(text(app.optString("title"), 30, ink(), true)); space(page, 6);
        page.addView(text(app.optString("category") + "  ·  " + app.optString("package_id"), 12, muted(), false));
        space(page, 25);
        String slug = app.optString("slug");
        Long existing = downloads.get(slug);
        TextView download = text(completedDownloads.containsKey(slug) ? "Open · Install" : existing == null ? (updateAvailable(app) ? "Update  ↓" : "Install  ↓") : "Downloading…", 16, bg(), true);
        download.setGravity(Gravity.CENTER); download.setPadding(dp(18), dp(15), dp(18), dp(15));
        download.setBackground(shape(green(), 12));
        download.setOnClickListener(v -> { if (completedDownloads.containsKey(slug)) openDownloaded(slug, download); else if (downloads.containsKey(slug)) cancelDownload(slug, download); else startDownload(app, download); });
        page.addView(download); space(page, 30);
        if (existing != null) pollDownload(slug, download);
        page.addView(text("About this app", 19, ink(), true)); space(page, 10);
        page.addView(text(app.optString("description"), 15, muted(), false)); space(page, 25);
        page.addView(text("Android will ask you to confirm installation after downloading.", 12, muted(), false));
    }
    private void startDownload(JSONObject app, TextView button) {
        String slug = app.optString("slug");
        if (!slug.matches("[a-z0-9]+(-[a-z0-9]+)*")) return;
        try {
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            Uri url = Uri.parse(BuildConfig.SUPABASE_URL + "/functions/v1/download-apk?slug=" + Uri.encode(slug));
            DownloadManager.Request request = new DownloadManager.Request(url);
            request.setTitle(app.optString("title"));
            request.setDescription("Downloading APK in APK STORE");
            request.setMimeType("application/vnd.android.package-archive");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalFilesDir(this, android.os.Environment.DIRECTORY_DOWNLOADS, slug + "-" + System.currentTimeMillis() + ".apk");
            long id = manager.enqueue(request);
            downloads.put(slug, id);
            pollDownload(slug, button);
        } catch (Exception e) { button.setText("Download unavailable · Retry"); }
    }
    private void openDownloaded(String slug, TextView button) {
        Long id = completedDownloads.get(slug);
        if (id == null) return;
        DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        Uri file = manager.getUriForDownloadedFile(id);
        if (file == null) { completedDownloads.remove(slug); button.setText("Install  ↓"); return; }
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(file, "application/vnd.android.package-archive");
        install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivity(install); } catch (Exception e) { button.setText("Open in Downloads"); }
    }
    private void cancelDownload(String slug, TextView button) {
        Long id = downloads.remove(slug);
        Runnable poll = downloadPolls.remove(slug);
        if (poll != null) handler.removeCallbacks(poll);
        if (id != null) ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).remove(id);
        button.setText("Install  ↓");
    }
    private void pollDownload(String slug, TextView button) {
        Runnable previous = downloadPolls.remove(slug);
        if (previous != null) handler.removeCallbacks(previous);
        Runnable poll = new Runnable() {
            @Override public void run() {
                Long id = downloads.get(slug);
                if (id == null) return;
                DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
                    if (cursor == null || !cursor.moveToFirst()) { cancelDownload(slug, button); return; }
                    int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                    if (status == DownloadManager.STATUS_SUCCESSFUL) {
                        downloads.remove(slug); downloadPolls.remove(slug);
                        completedDownloads.put(slug, id);
                        button.setText("Open · Install");
                        return;
                    }
                    if (status == DownloadManager.STATUS_FAILED) { cancelDownload(slug, button); button.setText("Download failed · Retry"); return; }
                    long done = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    button.setText(total > 0 ? "Downloading… " + (done * 100 / total) + "% · Cancel" : "Downloading… · Cancel");
                    handler.postDelayed(this, 500);
                } catch (Exception e) { cancelDownload(slug, button); button.setText("Download failed · Retry"); }
            }
        };
        downloadPolls.put(slug, poll);
        handler.post(poll);
    }
    @Override public void onBackPressed() { if (legalPage) showAbout(); else showTab(APPS); }
    @Override protected void onDestroy() {
        if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
        for (Runnable poll : downloadPolls.values()) handler.removeCallbacks(poll);
        worker.shutdownNow(); super.onDestroy();
    }
}
