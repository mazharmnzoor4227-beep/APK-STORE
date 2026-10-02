package com.apkstore.client;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdOptions;
import com.google.android.gms.ads.nativead.NativeAdView;

/**
 * Central AdMob helper for APK STORE.
 *
 * <p>Ad-unit IDs come from {@code BuildConfig} fields which default to GOOGLE'S OFFICIAL
 * TEST IDs (test ads only, safe to ship). Inject real production IDs at build time with
 * gradle {@code -P} flags — never hard-code them here:
 * <pre>
 *   ./gradlew assembleRelease \
 *     -PadmobAppId='ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY' \
 *     -PadmobBannerId='ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ' \
 *     -PadmobNativeId='ca-app-pub-XXXXXXXXXXXXXXXX/WWWWWWWWWW'
 * </pre>
 * The manifest {@code APPLICATION_ID} meta-data is wired through the
 * {@code admobAppId} manifest placeholder ({@code -PadmobAppId=...}).
 *
 * <p>Every entry point is null-safe and exception-guarded: ads must never crash the app.
 */
public final class Ads {
    private Ads() { }

    /** Callback for a single native-ad load. */
    public interface NativeAdCallback {
        void onAd(NativeAd ad);
        void onFail();
    }

    /** Ads are always on; with the default test IDs only test ads are served. */
    public static boolean enabled() {
        return true;
    }

    /**
     * Creates a banner {@link AdView} (320x50). The caller adds it to a layout,
     * calls {@link #loadBanner(AdView)}, and destroys it when the hosting view goes away.
     * Returns null if creation fails.
     */
    public static AdView banner(Context ctx) {
        try {
            AdView view = new AdView(ctx);
            view.setAdUnitId(BuildConfig.ADMOB_BANNER_ID);
            view.setAdSize(AdSize.BANNER);
            return view;
        } catch (Throwable t) {
            return null;
        }
    }

    /** Starts loading a banner created by {@link #banner(Context)}. Null-safe. */
    public static void loadBanner(AdView view) {
        try {
            if (view != null) view.loadAd(new AdRequest.Builder().build());
        } catch (Throwable ignored) { }
    }

    /**
     * Loads a single native ad. Exactly one of {@code onAd}/{@code onFail} fires.
     * The loaded ad must be destroyed via {@link #destroyNative(NativeAd)} when discarded.
     */
    public static void loadNative(Context ctx, NativeAdCallback cb) {
        try {
            new AdLoader.Builder(ctx, BuildConfig.ADMOB_NATIVE_ID)
                    .forNativeAd(ad -> { if (cb != null) cb.onAd(ad); })
                    .withAdListener(new AdListener() {
                        @Override public void onAdFailedToLoad(LoadAdError error) {
                            if (cb != null) cb.onFail();
                        }
                    })
                    .withNativeAdOptions(new NativeAdOptions.Builder().build())
                    .build()
                    .loadAd(new AdRequest.Builder().build());
        } catch (Throwable t) {
            if (cb != null) cb.onFail();
        }
    }

    /**
     * Builds a small programmatic {@link NativeAdView} (headline + body + icon +
     * call-to-action, plus an "Ad" badge so it reads as a distinct ad row) styled
     * with the caller's theme colors. All pixel values must already be density-scaled.
     * Returns null on any failure.
     */
    public static NativeAdView nativeCard(Context ctx, NativeAd ad,
                                          int headlineColor, int bodyColor, int badgeColor,
                                          int ctaBackground, int ctaTextColor,
                                          int cardBackground, int cornerPx, int padPx) {
        if (ctx == null || ad == null) return null;
        try {
            NativeAdView adView = new NativeAdView(ctx);
            GradientDrawable bg = new GradientDrawable();
            bg.setColor(cardBackground);
            bg.setCornerRadius(cornerPx);
            adView.setBackground(bg);
            adView.setPadding(padPx, padPx, padPx, padPx);

            LinearLayout col = new LinearLayout(ctx);
            col.setOrientation(LinearLayout.VERTICAL);
            adView.addView(col, new FrameLayout.LayoutParams(-1, -2));

            TextView badge = new TextView(ctx);
            badge.setText("Ad");
            badge.setTextSize(10);
            badge.setTypeface(null, Typeface.BOLD);
            badge.setTextColor(badgeColor);
            col.addView(badge);

            LinearLayout row = new LinearLayout(ctx);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(0, padPx / 2, 0, padPx / 2);
            col.addView(row, new LinearLayout.LayoutParams(-1, -2));

            ImageView icon = new ImageView(ctx);
            int iconPx = Math.max(padPx * 3, 1);
            row.addView(icon, new LinearLayout.LayoutParams(iconPx, iconPx));

            LinearLayout copy = new LinearLayout(ctx);
            copy.setOrientation(LinearLayout.VERTICAL);
            copy.setPadding(padPx, 0, 0, 0);
            row.addView(copy, new LinearLayout.LayoutParams(0, -2, 1));

            TextView headline = new TextView(ctx);
            headline.setTextSize(14);
            headline.setTypeface(null, Typeface.BOLD);
            headline.setTextColor(headlineColor);
            headline.setSingleLine(true);
            headline.setEllipsize(android.text.TextUtils.TruncateAt.END);
            copy.addView(headline);

            TextView body = new TextView(ctx);
            body.setTextSize(12);
            body.setTextColor(bodyColor);
            body.setMaxLines(2);
            body.setEllipsize(android.text.TextUtils.TruncateAt.END);
            copy.addView(body);

            TextView cta = new TextView(ctx);
            cta.setTextSize(13);
            cta.setTypeface(null, Typeface.BOLD);
            cta.setTextColor(ctaTextColor);
            cta.setGravity(Gravity.CENTER);
            cta.setPadding(padPx, padPx / 2, padPx, padPx / 2);
            GradientDrawable ctaBg = new GradientDrawable();
            ctaBg.setColor(ctaBackground);
            ctaBg.setCornerRadius(cornerPx / 2f);
            cta.setBackground(ctaBg);
            LinearLayout.LayoutParams ctaLp = new LinearLayout.LayoutParams(-1, -2);
            ctaLp.topMargin = padPx / 2;
            col.addView(cta, ctaLp);

            // Populate assets (null-safe) and register them with the ad view.
            headline.setText(safe(ad.getHeadline()));
            String bodyText = safe(ad.getBody());
            if (bodyText.isEmpty()) body.setVisibility(View.GONE);
            else body.setText(bodyText);
            String ctaText = safe(ad.getCallToAction());
            if (ctaText.isEmpty()) cta.setVisibility(View.GONE);
            else cta.setText(ctaText);
            NativeAd.Image iconImage = null;
            try { iconImage = ad.getIcon(); } catch (Throwable ignored) { }
            if (iconImage != null && iconImage.getDrawable() != null) {
                icon.setImageDrawable(iconImage.getDrawable());
            } else {
                icon.setVisibility(View.GONE);
            }

            adView.setHeadlineView(headline);
            adView.setBodyView(body);
            adView.setIconView(icon);
            adView.setCallToActionView(cta);
            adView.setNativeAd(ad);
            return adView;
        } catch (Throwable t) {
            return null;
        }
    }

    /** Destroys a loaded native ad. Null-safe. */
    public static void destroyNative(NativeAd ad) {
        try {
            if (ad != null) ad.destroy();
        } catch (Throwable ignored) { }
    }

    private static String safe(String s) {
        return s == null ? "" : s;
    }
}
