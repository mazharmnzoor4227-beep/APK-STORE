# APK STORE

An independent Android APK catalog (`com.apkstore.client`). Listings and binaries must be approved by their owners or licensed for redistribution. The app has its own branding.

## Build

Install JDK 17 and Android SDK 35. From `apps/android`, run:

```sh
gradle :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

The release build is R8 minified and unsigned in CI. To distribute it, sign with your own keystore outside this repository using `apksigner`; retain that same key for future upgrades. Never commit keystores, passwords, service-role credentials or upload tokens. `supabasePublishableKey` is an optional Gradle property; its default publishable key is a public client credential and is restricted by RLS.

CI builds the same targets in `.github/workflows/build-android.yml`. The launcher is an adaptive vector icon. Android 8+ is supported.

## Supabase setup

Create a Supabase project, apply `supabase/migrations/` in filename order, and deploy `supabase/functions/download-apk/index.ts`. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Edge Function secrets. The privileged `admin-upload` function additionally needs owner authentication and any configured R2 credentials. Set the Android `SUPABASE_URL` and publishable key in `apps/android/app/build.gradle` for your own project.

`apps`, `releases`, `media`, `categories`, and review tables use RLS. Anonymous catalog access is SELECT only; apps must have `visibility='published'` and point to a published current release. `app-icons` is public read; `apk-files` is private and served through short-lived signed URLs. The download Edge Function accepts a validated slug, looks up its approved release, and redirects only to the configured trusted host or a scoped storage URL. Never expose the service-role key in the Android app.

The release's `apk_sha256` and `byte_size` are the canonical hash and size fields. Android verifies both, as well as the APK package and signing certificate, before creating a `PackageInstaller` session.

## Publish an app or release

1. Confirm the owner's approval or redistribution license. Record the source URL, license, category, developer and screenshots you have rights to use.
2. Upload the APK through the owner review flow (`admin-upload`), inspect its package ID, version code/name, signing certificate, SHA-256 and exact byte size, and approve the candidate. Keep APK files in private Storage/R2 or the configured trusted release host.
3. Set the app's `icon_url` to a public HTTPS image. Fill editorial metadata (`short_description`, `is_recommended`, `stars`, `min_sdk`, etc.) only from verified sources. Publish the app with `visibility='published'` and `current_release_id` referring to the approved release.
4. For an update, increment `version_code` and retain the same package ID and signing certificate. Check the Android update list and install flow on a device.

The repository has no signing material. See `docs/superpowers/plans/2026-09-28-apk-store-upgrade.md` for the upgrade milestones and remaining work.
