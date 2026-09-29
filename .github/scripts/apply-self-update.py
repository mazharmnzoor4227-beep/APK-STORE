from pathlib import Path
import re

p = Path('apps/android/app/src/main/java/com/apkstore/client/MainActivity.java')
s = p.read_text()

old = '''                ApkIntegrity.verifyFile(apk, release.optString("apk_sha256"), release.optLong("byte_size"));
                ApkIntegrity.verifyPackage(this, apk, target.optString("package_id"), release.optString("certificate_sha256"));
                InstallCoordinator.install(this, apk, slug, target.optString("package_id"));'''
new = '''                ApkIntegrity.verifyFile(apk, release.optString("apk_sha256"), release.optLong("byte_size"));
                ApkIntegrity.verifyPackage(this, apk, target.optString("package_id"), release.optString("certificate_sha256"));
                if (StoreIdentity.isStoreListing(target.optString("package_id"), slug)) {
                    ApkUpdateVerifier.Result selfCheck = ApkUpdateVerifier.verify(
                            this, apk, release.optString("apk_sha256"), release.optLong("byte_size"));
                    if (!selfCheck.ok) {
                        if (!apk.delete() && apk.exists()) apk.deleteOnExit();
                        throw new SecurityException(selfCheck.reason);
                    }
                }
                InstallCoordinator.install(this, apk, slug, target.optString("package_id"));'''
if old not in s:
    raise SystemExit('install verification block not found')
s = s.replace(old, new, 1)

old = '''        JSONObject app = null;
        for (int i = 0; i < catalog.length(); i++) {
            JSONObject candidate = catalog.optJSONObject(i);
            if (candidate != null && slug.equals(candidate.optString("slug"))) { app = candidate; break; }
        }'''
new = '''        JSONObject app = detailApp != null && slug.equals(detailApp.optString("slug")) ? detailApp : null;
        if (app == null) for (int i = 0; i < catalog.length(); i++) {
            JSONObject candidate = catalog.optJSONObject(i);
            if (candidate != null && slug.equals(candidate.optString("slug"))) { app = candidate; break; }
        }'''
if old not in s:
    raise SystemExit('downloaded app lookup block not found')
s = s.replace(old, new, 1)

method = '''    private void checkStoreUpdate() {
        final LinearLayout page = informationPage("APK STORE update", this::showAbout);
        page.addView(text("Checking for updates…", 16, muted(), false));
        worker.execute(() -> {
            try {
                SelfUpdateRepository.UpdateInfo info = new SelfUpdateRepository().fetchLatest();
                runOnUiThread(() -> {
                    page.removeAllViews();
                    if (!StoreUpdatePolicy.isUpdateAvailable(BuildConfig.VERSION_CODE, info.versionCode)) {
                        page.addView(text("You're up to date", 22, ink(), true));
                        space(page, 8);
                        page.addView(text("Version " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")", 14, muted(), false));
                        return;
                    }
                    String validation = StoreUpdatePolicy.validateMetadata(
                            info.packageId, info.slug, BuildConfig.VERSION_CODE, info.versionCode,
                            info.apkSha256, info.byteSize, info.certificateSha256,
                            BuildConfig.APK_STORE_SIGNER_SHA256);
                    if (validation != null) {
                        page.addView(text("Update blocked", 22, ink(), true));
                        space(page, 8);
                        page.addView(text(validation, 14, muted(), false));
                        return;
                    }
                    page.addView(text("Update available", 22, ink(), true));
                    space(page, 8);
                    page.addView(text("Version " + info.versionName + " (" + info.versionCode + ")", 14, muted(), false));
                    if (!info.releaseNotes.isBlank()) {
                        space(page, 12);
                        page.addView(text(info.releaseNotes, 14, ink(), false));
                    }
                    space(page, 18);
                    informationLink(page, "Download update", "Verified before Android asks to install", () -> {
                        try {
                            JSONObject fresh = info.asCatalogApp();
                            detailApp = fresh;
                            startDownload(fresh);
                        } catch (Exception error) {
                            page.addView(text("Update could not start.", 14, muted(), false));
                        }
                    });
                });
            } catch (Exception error) {
                runOnUiThread(() -> {
                    page.removeAllViews();
                    String message = error.getMessage();
                    page.addView(text("Could not check for updates", 22, ink(), true));
                    space(page, 8);
                    page.addView(text(message == null || message.isBlank() ? "Try again when you're online." : message, 14, muted(), false));
                    space(page, 18);
                    informationLink(page, "Retry", "Check the trusted APK STORE release again", this::checkStoreUpdate);
                });
            }
        });
    }

    private void openLink'''
pattern = r'    private void checkStoreUpdate\(\) \{.*?\n    \}\n\n    private void openLink'
s, count = re.subn(pattern, method, s, count=1, flags=re.S)
if count != 1:
    raise SystemExit('checkStoreUpdate block not found')

p.write_text(s)
