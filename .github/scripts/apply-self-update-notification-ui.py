from pathlib import Path

p = Path('apps/android/app/src/main/java/com/apkstore/client/MainActivity.java')
s = p.read_text()

if 'import android.Manifest;' not in s:
    s = s.replace('import android.app.Activity;\n', 'import android.Manifest;\nimport android.app.Activity;\n', 1)
if 'import android.os.Build;' not in s:
    s = s.replace('import android.os.Bundle;\n', 'import android.os.Build;\nimport android.os.Bundle;\n', 1)

old = '''        if (catalog.length() > 0) load();
        scheduleUpdates();
    }
    private void scheduleUpdates() {'''
new = '''        if (catalog.length() > 0) load();
        scheduleUpdates();
        maybeRequestUpdateNotificationPermission();
        maybeOpenSelfUpdateFromIntent(getIntent());
    }
    private void maybeRequestUpdateNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && settingsStore.selfUpdateNotifications()
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 4102);
        }
    }
    private void maybeOpenSelfUpdateFromIntent(Intent intent) {
        if (intent == null || !intent.getBooleanExtra("show_self_update", false)) return;
        intent.removeExtra("show_self_update");
        new Handler(Looper.getMainLooper()).post(this::checkStoreUpdate);
    }
    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        maybeOpenSelfUpdateFromIntent(intent);
    }
    private void scheduleUpdates() {'''
if old not in s:
    raise SystemExit('onCreate/scheduleUpdates anchor not found')
s = s.replace(old, new, 1)

old = '''        informationLink(page, "Update check interval", "Every 6 or 12 hours", () -> new AlertDialog.Builder(this)
                .setItems(new String[]{"6 hours", "12 hours"}, (dialog, which) -> {
                    settingsStore.setUpdateHours(which == 0 ? 6 : 12); scheduleUpdates(); showSettings();
                }).show());
        informationLink(page, "Clear catalog cache", "Reload listings from the network", () -> {'''
new = '''        informationLink(page, "Update check interval", "Every 6 or 12 hours", () -> new AlertDialog.Builder(this)
                .setItems(new String[]{"6 hours", "12 hours"}, (dialog, which) -> {
                    settingsStore.setUpdateHours(which == 0 ? 6 : 12); scheduleUpdates(); showSettings();
                }).show());
        informationLink(page, "Store update notifications", settingsStore.selfUpdateNotifications() ? "On" : "Off", () -> {
            boolean enabled = !settingsStore.selfUpdateNotifications();
            settingsStore.setSelfUpdateNotifications(enabled);
            if (enabled) maybeRequestUpdateNotificationPermission();
            showSettings();
        });
        informationLink(page, "Clear catalog cache", "Reload listings from the network", () -> {'''
if old not in s:
    raise SystemExit('settings update interval anchor not found')
s = s.replace(old, new, 1)

p.write_text(s)
