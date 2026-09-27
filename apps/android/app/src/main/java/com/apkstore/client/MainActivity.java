package com.apkstore.client;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.widget.EditText;
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
    private final int bg = Color.rgb(8, 13, 10), surface = Color.rgb(17, 25, 19);
    private final int green = Color.rgb(122, 242, 154), white = Color.rgb(239, 245, 239);
    private final int muted = Color.rgb(153, 169, 155);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private LinearLayout results;
    private EditText search;
    private int generation;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
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
        shape.setColor(surface); shape.setCornerRadius(dp(16));
        shape.setStroke(dp(1), Color.rgb(39, 55, 44));
        return shape;
    }
    private LinearLayout column() {
        LinearLayout result = new LinearLayout(this);
        result.setOrientation(LinearLayout.VERTICAL);
        result.setPadding(dp(22), dp(26), dp(22), dp(32));
        return result;
    }
    private void gap(LinearLayout parent, int height) {
        View spacer = new View(this);
        parent.addView(spacer, new LinearLayout.LayoutParams(1, dp(height)));
    }
    private void showCatalog() {
        ScrollView scroll = new ScrollView(this); scroll.setFillViewport(true); scroll.setBackgroundColor(bg);
        LinearLayout page = column(); scroll.addView(page); setContentView(scroll);
        page.addView(label("▢  APK STORE  _", 23, white, true));
        gap(page, 65);
        page.addView(label("●  INDEPENDENT ANDROID APPS", 11, green, true));
        gap(page, 18);
        page.addView(label("Discover\napps.", 54, white, true));
        gap(page, 18);
        page.addView(label("Explore original Android apps and follow their latest releases.", 16, muted, false));
        gap(page, 31);
        search = new EditText(this);
        search.setSingleLine(true); search.setHint("Search apps"); search.setHintTextColor(muted);
        search.setTextColor(white); search.setTextSize(16); search.setPadding(dp(18), dp(12), dp(18), dp(12));
        search.setBackground(panel()); page.addView(search);
        gap(page, 58);
        page.addView(label("01 / CATALOG", 11, green, true));
        gap(page, 14);
        page.addView(label("Latest apps", 29, white, true));
        gap(page, 20);
        results = new LinearLayout(this); results.setOrientation(LinearLayout.VERTICAL); page.addView(results);
        search.addTextChangedListener(new TextWatcher() {
            public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            public void onTextChanged(CharSequence s, int start, int before, int count) { load(s.toString()); }
            public void afterTextChanged(Editable value) {}
        });
        load("");
    }
    private void load(String query) {
        final int request = ++generation;
        results.removeAllViews(); results.addView(label("Loading catalog…", 15, muted, false));
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
                    results.removeAllViews(); results.addView(label(error.getMessage(), 15, muted, false));
                } });
            }
        });
    }
    private void render(JSONArray apps, String query) {
        results.removeAllViews();
        if (apps.length() == 0) {
            LinearLayout card = column(); card.setGravity(Gravity.CENTER); card.setBackground(panel());
            card.addView(label(query.isEmpty() ? "The store is getting ready" : "No matching apps", 20, white, true));
            gap(card, 12);
            card.addView(label("Apps appear after the creator approves their release.", 14, muted, false));
            results.addView(card); return;
        }
        for (int i = 0; i < apps.length(); i++) {
            JSONObject app = apps.optJSONObject(i);
            if (app == null) continue;
            LinearLayout card = column(); card.setBackground(panel());
            card.addView(label(app.optString("category").toUpperCase(), 11, green, true)); gap(card, 10);
            card.addView(label(app.optString("title"), 22, white, true)); gap(card, 9);
            card.addView(label(app.optString("description"), 14, muted, false)); gap(card, 13);
            card.addView(label("View app  ↗", 14, green, true));
            card.setOnClickListener(v -> showDetail(app));
            results.addView(card); gap(results, 14);
        }
    }
    private void showDetail(JSONObject app) {
        ScrollView scroll = new ScrollView(this); scroll.setBackgroundColor(bg);
        LinearLayout page = column(); scroll.addView(page); setContentView(scroll);
        TextView back = label("←  Back to apps", 15, green, true); back.setOnClickListener(v -> showCatalog()); page.addView(back);
        gap(page, 60); page.addView(label(app.optString("category").toUpperCase(), 12, green, true)); gap(page, 15);
        page.addView(label(app.optString("title"), 43, white, true)); gap(page, 12);
        page.addView(label(app.optString("package_id"), 13, muted, false)); gap(page, 30);
        page.addView(label(app.optString("description"), 17, white, false)); gap(page, 40);
        page.addView(label("The download is available on the website after the release is published and hosting is connected.", 14, muted, false));
    }
    @Override public void onBackPressed() { showCatalog(); }
    @Override protected void onDestroy() { worker.shutdownNow(); super.onDestroy(); }
}
