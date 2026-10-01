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

Create a Supabase project, apply `supabase/migrations/` in filename order, and deploy `supabase/functions/download-apk/index.ts`. Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Edge Function secrets. Set the Android `SUPABASE_URL` and publishable key in `apps/android/app/build.gradle` for your own project.

`apps`, `releases`, `media`, `categories`, and review tables use RLS. Anonymous catalog access is SELECT only; apps must have `visibility='published'` and point to a published current release. `app-icons` is public read; `apk-files` is private and served through short-lived signed URLs. The download Edge Function accepts a validated slug, looks up its approved release, and redirects only to the configured trusted host or a scoped storage URL. Never expose the service-role key in the Android app.

The `20260930_refresh_stars.sql` migration enables `http` and `pg_cron`, adds a restricted database function and schedules GitHub star snapshots daily at 03:15 UTC. Keep repository owner/name fields reviewed; the function accepts only validated GitHub path segments.

The release's `apk_sha256` and `byte_size` are the canonical hash and size fields. Android verifies both, as well as the APK package and signing certificate, before creating a `PackageInstaller` session.

## Publish an app or release

1. Confirm the owner's approval or redistribution license. Record the source URL, license, category, developer and screenshots you have rights to use.
2. Upload the APK through `/admin/apps/new`, inspect its package ID, version code/name, signing certificate, SHA-256 and exact byte size, and approve the candidate. APK files stay in private Storage until an approved release can be downloaded through the Edge Function.
3. Set the app's `icon_url` to a public HTTPS image. Fill editorial metadata (`short_description`, `is_recommended`, `stars`, `min_sdk`, etc.) only from verified sources. Publish the app with `visibility='published'` and `current_release_id` referring to the approved release.
4. For an update, increment `version_code` and retain the same package ID and signing certificate. Check the Android update list and install flow on a device.

The repository has no signing material. See `docs/superpowers/plans/2026-09-28-apk-store-upgrade.md` for the upgrade milestones and remaining work.

### Owner panel on a phone

The live Sites panel uses Supabase Auth and the owner-only `admin-upload` Edge Function. Open `/admin.html`, sign in, upload an APK, inspect it and approve publication. The Manage apps section shows icons, versions, package IDs and visibility; it edits details, changes icons, hides an app (`unlisted`) or publishes it again. Hiding removes the listing from public catalog responses without deleting release history. Use Refresh in Android's Apps header to fetch changes immediately. Server-only R2 credentials remain in Supabase function secrets.

The live owner panel is `https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site/admin.html` and uses the deployed Supabase `admin-upload` Edge Function. It runs the explicit upload → inspect → approve workflow and can manage catalog visibility, details and icons. Its static source is maintained by the Sites project, while `supabase/functions/admin-upload/index.ts` mirrors the deployed function. On Android Chrome, open the live admin page and choose **Install app** or **Add to Home screen**. The manifest launches the owner panel in standalone mode; owner authentication and network access remain required. It is an installed web app, not a separately signed Android APK.

### Add or reorder app screenshots

In Supabase Studio, open Storage → `app-screenshots` and upload WebP images to
`<slug>/1.webp`, `<slug>/2.webp`, etc. Resize each image to at most 1080 px wide
and keep it below 300 KB. The bucket is public for reading; upload access is
restricted to project operators. Copy the public URLs, then in Table Editor →
`apps` → your app set `screenshots` to the ordered `text[]` of URLs. For example:

```sql
update public.apps set screenshots = array[
  'https://qfbfxencwsgryoczkdyj.supabase.co/storage/v1/object/public/app-screenshots/example/1.webp',
  'https://qfbfxencwsgryoczkdyj.supabase.co/storage/v1/object/public/app-screenshots/example/2.webp'
] where slug = 'example';
```

Only publish screenshots you are allowed to redistribute. The app reads the
array in order after the next catalog refresh; no APK rebuild is needed.
