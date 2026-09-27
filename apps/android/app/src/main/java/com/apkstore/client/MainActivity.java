package com.apkstore.client;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private boolean light;
    private int bg() { return light ? Color.rgb(246, 249, 245) : Color.rgb(8, 13, 10); }
    private int surface() { return light ? Color.WHITE : Color.rgb(17, 25, 19); }
    private int green() { return light ? Color.rgb(24, 111, 57) : Color.rgb(122, 242, 154); }
    private int ink() { return light ? Color.rgb(23, 37, 27) : Color.rgb(239, 245, 239); }
    private int muted() { return light ? Color.rgb(77, 101, 84) : Color.rgb(153, 169, 155); }
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingSearch;
    private LinearLayout results;
    private EditText search;
    private LinearLayout categories;
    private JSONArray currentApps = new JSONArray();
    private String activeCategory = "";
    private int generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        light = getPreferences(0).getBoolean("light", false);
        showCatalog();
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private TextView label(String value, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value); view.setTextSize(size); view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }
    private GradientDrawable panel() {
        GradientDrawable shape = new GradientDrawable();
        shape.setColor(surface()); shape.setCornerRadius(dp(16));
        shape.setStroke(dp(1), light ? Color.rgb(204, 219, 207) : Color.rgb(39, 55, 44));
        return shape;
    }
    private LinearLayout column() {
        LinearLayout result = new LinearLayout(this);
        result.setOrientation(LinearLayout.VERTICAL);
        result.setPadding(dp(20), dp(20), dp(20), dp(32));
        return result;
    }
    private void gap(LinearLayout parent, int height) {
        View spacer = new View(this);
        parent.addView(spacer, new LinearLayout.LayoutParams(1, dp(height)));
    }
    private void showCatalog() {
        getWindow().setStatusBarColor(bg());
        getWindow().setNavigationBarColor(bg());
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(bg());
        LinearLayout page = column(); scroll.addView(page); setContentView(scroll);
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL);
        TextView brand = label("▢  APK STORE", 23, ink(), true);
        header.addView(brand, new LinearLayout.LayoutParams(0, dp(48), 1));
        TextView theme = label(light ? "☀" : "◐", 22, green(), false);
        theme.setGravity(Gravity.CENTER); theme.setContentDescription("Toggle light and dark mode");
        theme.setBackground(panel()); header.addView(theme, new LinearLayout.LayoutParams(dp(48), dp(48)));
        theme.setOnClickListener(v -> { light = !light; getPreferences(0).edit().putBoolean("light", light).apply(); showCatalog(); });
        page.addView(header); gap(page, 30);
        page.addView(label("Discover", 37, ink(), true)); gap(page, 5);
        page.addView(label("Apps made to be useful.", 15, muted(), false)); gap(page, 24);
        search = new EditText(this);
        search.setSingleLine(true); search.setHint("⌕   Search apps"); search.setHintTextColor(muted());
        search.setTextColor(ink()); search.setTextSize(16); search.setPadding(dp(18), dp(12), dp(18), dp(12));
        search.setBackground(panel()); page.addView(search);
        gap(page, 28);
        LinearLayout shelf = new LinearLayout(this); shelf.setGravity(Gravity.CENTER_VERTICAL);
        shelf.addView(label("Latest apps", 25, ink(), true), new LinearLayout.LayoutParams(0, dp(40), 1));
        shelf.addView(label("ANDROID  ↗", 11, green(), true)); page.addView(shelf);
        gap(page, 12);
        categories = new LinearLayout(this); categories.setOrientation(LinearLayout.HORIZONTAL);
        HorizontalScrollView categoryScroll = new HorizontalScrollView(this);
        categoryScroll.setHorizontalScrollBarEnabled(false); categoryScroll.addView(categories);
        page.addView(categoryScroll);
        gap(page, 17);
        results = new LinearLayout(this); results.setOrientation(LinearLayout.VERTICAL); page.addView(results);
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
                String value = s.toString();
                pendingSearch = () -> load(value);
                handler.postDelayed(pendingSearch, 250);
            }
            public void afterTextChanged(Editable value) {}
        });
        load("");
    }
    private void load(String query) {
        final int request = ++generation;
        results.removeAllViews(); results.addView(label("Loading catalog…", 15, muted(), false));
        worker.execute(() -> {
            try {
                if (BuildConfig.SUPABASE_KEY.isEmpty()) throw new Exception("Catalog connection is not configured.");
                String endpoint = BuildConfig.SUPABASE_URL + "/rest/v1/apps?select=id,slug,title,package_id,category,description&visibility=eq.published&current_release_id=not.is.null&order=created_at.desc&limit=50";
                if (!query.trim().isEmpty()) endpoint += "&title=ilike.*" + URLEncoder.encode(query.trim().replace("*", ""), "UTF-8") + "*";
                HttpURLConnection conn = (HttpURLConnection) new URL(endpoint).openConnection();
                conn.setConnectTimeout(12000); conn.setReadTimeout(12000);
                conn.setRequestProperty("apikey", BuildConfig.SUPABASE_KEY);
                conn.setRequestProperty("Authorization", "Bearer " + BuildConfig.SUPABASE_KEY);
                if (conn.getResponseCode() != 200) throw new Exception("Catalog temporarily unavailable.");
                try (InputStream stream = conn.getInputStream()) {
                    JSONArray apps = new JSONArray(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
                    runOnUiThread(() -> { if (request == generation) render(apps, query); });
                } finally { conn.disconnect(); }
            } catch (Exception error) {
                runOnUiThread(() -> { if (request == generation) {
                    results.removeAllViews(); results.addView(label(error.getMessage(), 15, muted(), false));
                } });
            }
        });
    }
    private void render(JSONArray apps, String query) {
        currentApps = apps;
        categories.removeAllViews();
        if (apps.length() > 0) {
            java.util.LinkedHashSet<String> names = new java.util.LinkedHashSet<>();
            names.add("All");
            for (int i = 0; i < apps.length(); i++) names.add(apps.optJSONObject(i).optString("category"));
            for (String name : names) {
                TextView chip = label(name, 13, name.equals(activeCategory.isEmpty() ? "All" : activeCategory) ? bg() : ink(), true);
                chip.setPadding(dp(14), dp(10), dp(14), dp(10));
                GradientDrawable shape = panel();
                if (name.equals(activeCategory.isEmpty() ? "All" : activeCategory)) shape.setColor(green());
                chip.setBackground(shape);
                LinearLayout.LayoutParams item = new LinearLayout.LayoutParams(-2, -2); item.setMargins(0, 0, dp(8), 0);
                categories.addView(chip, item);
                chip.setOnClickListener(v -> { activeCategory = name.equals("All") ? "" : name; render(currentApps, query); });
            }
        }
        results.removeAllViews();
        if (apps.length() == 0) {
            LinearLayout card = column(); card.setPadding(dp(24), dp(26), dp(24), dp(26)); card.setBackground(panel());
            card.addView(label("▢", 32, green(), true)); gap(card, 13);
            card.addView(label(query.isEmpty() ? "No apps published yet" : "No matching apps", 20, ink(), true));
            gap(card, 8);
            card.addView(label(query.isEmpty() ? "New apps will appear here as soon as their releases are approved." : "Try another search term.", 14, muted(), false));
            results.addView(card); return;
        }
        for (int i = 0; i < apps.length(); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null || (!activeCategory.isEmpty() && !activeCategory.equals(app.optString("category")))) continue;
            LinearLayout card = new LinearLayout(this); card.setGravity(Gravity.CENTER_VERTICAL);
            card.setPadding(dp(16), dp(16), dp(16), dp(16)); card.setBackground(panel());
            TextView icon = label(app.optString("title").substring(0, 1).toUpperCase(), 27, green(), true);
            icon.setGravity(Gravity.CENTER); icon.setBackground(panel());
            card.addView(icon, new LinearLayout.LayoutParams(dp(62), dp(62)));
            LinearLayout copy = new LinearLayout(this); copy.setOrientation(LinearLayout.VERTICAL); copy.setPadding(dp(15), 0, 0, 0);
            copy.addView(label(app.optString("title"), 18, ink(), true)); gap(copy, 5);
            copy.addView(label(app.optString("category") + "  •  APK", 13, muted(), false));
            card.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));
            card.addView(label("↗", 18, green(), true));
            card.setOnClickListener(v -> showDetail(app));
            results.addView(card); gap(results, 14);
        }
    }
    private void showDetail(JSONObject app) {
        ScrollView scroll = new ScrollView(this); scroll.setBackgroundColor(bg());
        LinearLayout page = column(); scroll.addView(page); setContentView(scroll);
        TextView back = label("←  Back to apps", 15, green(), true); back.setOnClickListener(v -> showCatalog()); page.addView(back);
        gap(page, 40); page.addView(label(app.optString("category").toUpperCase(), 12, green(), true)); gap(page, 15);
        page.addView(label(app.optString("title"), 43, ink(), true)); gap(page, 12);
        page.addView(label(app.optString("package_id"), 13, muted(), false)); gap(page, 30);
        page.addView(label(app.optString("description"), 17, ink(), false)); gap(page, 40);
        TextView download = label("Download APK  ↗", 17, bg(), true);
        download.setPadding(dp(18), dp(15), dp(18), dp(15));
        GradientDrawable button = new GradientDrawable(); button.setColor(green()); button.setCornerRadius(dp(10));
        download.setBackground(button);
        download.setOnClickListener(v -> {
            String slug = app.optString("slug");
            if (!slug.matches("[a-z0-9]+(-[a-z0-9]+)*")) return;
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(BuildConfig.SUPABASE_URL + "/functions/v1/download-apk?slug=" + slug));
            startActivity(intent);
        });
        page.addView(download); gap(page, 18);
        page.addView(label("Android will ask you to confirm installation after the APK downloads.", 14, muted(), false));
    }
    @Override public void onBackPressed() { showCatalog(); }
    @Override protected void onDestroy() {
        if (pendingSearch != null) handler.removeCallbacks(pendingSearch);
        worker.shutdownNow(); super.onDestroy();
    }
}
