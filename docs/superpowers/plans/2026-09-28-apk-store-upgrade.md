# APK STORE upgrade implementation plan

Source reviewed: Android MainActivity.java (882 lines), manifest, Gradle and CI; all catalog migrations and download Edge Function. Implement in Java Views in small steps to preserve the working app. Keep version 1.0.6 icon fix.

## Existing facts

- `releases.apk_sha256` and `releases.byte_size` already provide requested hash and size; `version_name`, `published_at`, and `release_notes` already exist. Use these canonical fields rather than duplicates.
- APK downloads already use app-specific external files via DownloadManager; cancellation exists, but history, resume and cleanup do not.
- Manifest already disables cleartext and backup. `QUERY_ALL_PACKAGES` currently supports update discovery; retain pending targeted visibility review.
- RLS exists in migrations for catalog tables, but inspect the live database policies, grants and Storage before changing them.

## Milestones and files

1. **Fix installation, integrity, downloads and loading.** Add `apps/android/app/src/main/java/com/apkstore/client/{CatalogRepository,ApkIntegrity,InstallCoordinator,DownloadStore,SettingsStore}.java`; edit `MainActivity.java`, `AndroidManifest.xml`, `app/build.gradle`; add `res/xml/` adaptive icon and vector layers. Verify hash and package/signature before a PackageInstaller session. Persist attempts, handle installer statuses, keep APK until success, provide cancel/retry, page REST results and cache JSON. Add unit tests under `app/src/test/java/com/apkstore/client/`.
2. **Backend metadata and security.** Add `supabase/migrations/20260928_store_metadata.sql` for approved metadata, screenshots, permissions, categories and storage policies; update `supabase/functions/download-apk/index.ts`, publishing flow and SQL tests. Inspect live RLS/grants/buckets; apply migration and verify read-only anon behavior.
3. **Home/top bar/search/detail.** Edit Android screen classes (or extract `StoreScreens.java`) and MainActivity, carrying recommendations, latest, stars, random picks, recent searches and category filtering, detail metadata, expandable sections and screenshots.
4. **Downloads/updates.** Add download history screen, update count/actions, WorkManager periodic checks with configurable interval, and state transitions with accessible progress. Edit manifest, Gradle, MainActivity, store and tests.
5. **Menu/settings/polish.** Add My apps, favourites, blacklist, ignored updates, settings and About links. Add theme system/dark/light, cache clear, loading/empty/error retry, content descriptions and touch targets.
6. **Delivery.** Add `.gitignore` and README with build/publish/Supabase instructions; keep keystore/password outside source. Build debug and minified release in CI, verify signing/install path on device if available, push complete source to GitHub, publish signed APK and update site only after verification.

After each milestone: compile/build and report actual results and remaining limitations. Do not insert unapproved third-party apps or assets.
