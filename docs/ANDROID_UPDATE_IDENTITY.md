# APK STORE — Permanent Android Update Identity

This file is the source of truth for every future APK STORE Android build and self-update release.

## Permanent identity

- App name: APK STORE
- Catalog slug: `apk-store-client`
- Android package / applicationId: `com.apkstore.client`
- Android namespace: `com.apkstore.client`
- Current published production baseline: versionName `1.1.6`, versionCode `14`
- Current stability candidate: versionName `1.1.7`, versionCode `15` — **not a published production release until physical-device smoke testing passes**
- minSdk: `26`
- targetSdk: `35`
- compileSdk: `35`

## Permanent production signing certificate

The owner explicitly reset the pre-launch test signing identity and created the permanent APK STORE release keystore. The app had not been publicly launched at the time of this reset. The private keystore and recovery credentials are intentionally NOT committed to this public repository.

- Key alias: `apkstore-release`
- Certificate subject / DN: `CN=APK STORE, O=APK STORE, C=PK`
- Public key: RSA 4096-bit
- Certificate SHA-256: `CD:5F:FF:73:67:5C:8C:78:3D:B5:1A:33:00:CC:06:84:57:63:21:5D:2C:7B:03:A6:4A:E7:F9:B5:89:36:05:85`
- Certificate SHA-1: `A8:B0:96:B0:F6:C5:85:91:B9:CE:2A:8F:01:10:A7:DE:DE:7E:8F:38`
- SHA-256 database form: `cd5fff73675c8c783db51a3300cc06845763215d2c7b03a64ae7f9b589360585`

The former `11:A0:A7:D5:...` fingerprint belongs to the abandoned pre-production signing line and is **obsolete**. It must never be used for a future APK STORE production update.

Every official APK STORE production APK from version `1.1.6` / versionCode `14` onward must be signed by the private key whose certificate matches the SHA-256 fingerprint above. If a future APK reports a different signing certificate, do not install or distribute it as an update.

## Never change these update-identity rules

1. Never change `applicationId 'com.apkstore.client'`.
2. Keep the official catalog slug `apk-store-client` for the APK STORE client listing.
3. Never add an `applicationIdSuffix` to a production build.
4. Every production update must use a `versionCode` greater than every previously installed/distributed production version.
5. Every production update must be signed by the SAME permanent APK STORE release keystore.
6. Never commit the release keystore, recovery file, or passwords to this public repository.
7. Do not distribute `app-release-unsigned.apk` as an update.
8. Do not use a newly generated debug keystore for production updates.

If the package ID and signing certificate stay the same and the new versionCode is higher, Android can install the APK as an update over an APK STORE installation from this permanent production line.

## Permanent signing environment variables

The Android Gradle configuration reads:

- `APKSTORE_KEYSTORE_PATH`
- `APKSTORE_KEYSTORE_PASSWORD`
- `APKSTORE_KEY_ALIAS`
- `APKSTORE_KEY_PASSWORD`

GitHub Actions uses these repository secrets:

- `APKSTORE_KEYSTORE_BASE64`
- `APKSTORE_KEYSTORE_PASSWORD`
- `APKSTORE_KEY_ALIAS`
- `APKSTORE_KEY_PASSWORD`

The keystore must be backed up safely and reused for all future APK STORE production updates.

## GitHub Actions release build

Official workflow file: `.github/workflows/build-android.yml`

Workflow name: `Build APK STORE Android`

The official signed release is created manually with `workflow_dispatch`. The workflow restores the permanent keystore from encrypted GitHub secrets, builds the release, verifies the Android identity and exact permanent signer, calculates APK SHA-256 and byte size, and uploads the signed APK artifact. A debug-signed or unsigned APK is not an official APK STORE production update.

## Verified published production baseline

The published `1.1.6` / versionCode `14` release was verified from the actual signed APK with:

- Package: `com.apkstore.client`
- Certificate SHA-256: `cd5fff73675c8c783db51a3300cc06845763215d2c7b03a64ae7f9b589360585`
- Certificate SHA-1: `a8b096b0f6c58591b9ce2a8f0110a7dede7e8f38`
- APK SHA-256: `545cff23fa9e0519c85c7c24d956a4b9b63ac97b60b2743141bef01cfcd9ff0e`
- APK byte size: `667246`

`1.1.6` is verified for build/signing identity. Functional device stability is a separate verification gate; do not interpret signature verification alone as proof that every runtime flow is crash-free.

## Crash reporting status

Crash reporting is now source-controlled and deployed:

- Android uses an application-level uncaught-exception handler that persists a bounded, sanitized crash report to private app storage before process death.
- Reports are uploaded later by WorkManager on a healthy process/network connection; fatal crash handling does not attempt live network I/O.
- Edge Function: `crash-report`, public ingest endpoint with server-side validation/rate limiting and `verify_jwt=false`.
- Migration source: `supabase/migrations/20260930_crash_reporting.sql`.
- Production migration `crash_reporting_v2_source_of_truth` is applied.
- Crash tables have RLS enabled and no public table policies; direct public writes are not allowed.
- The Edge Function recomputes the crash fingerprint server-side before writing through the service-role-only RPC.
- A synthetic v1.1.7 crash-ingest request was accepted end-to-end and verified in `crash_events`; the synthetic verification row was then removed.

No artificial crash trigger is included in production code.

## Security note about Supabase keys

The Android client contains a Supabase **publishable** key (`sb_publishable_...`). Publishable/anon-style client keys are designed to be present in client applications; authorization must be enforced by RLS and backend policy. Do not place `service_role`, `sb_secret_...`, signing secrets, R2 secrets, or other privileged credentials in Android source or Git history.

A current-source search found no `service_role`/`sb_secret_` credential committed in the repository. This statement is not a claim that every historical object in all rewritten/deleted Git history was cryptographically scanned. Do not force-push/rewrite repository history solely because a publishable key is visible.

## Canonical website and admin panel

Canonical public store UI:

`https://mazharmnzoor4227-beep.github.io/APK-STORE/`

The repository root redirects to the actual store UI under `apps/static/`. The static store's APK STORE download controls use the Supabase `download-apk?slug=apk-store-client` endpoint.

Admin panel path:

`https://mazharmnzoor4227-beep.github.io/APK-STORE/admin/`

Older `chatgpt.site` previews are not the canonical production website and may contain stale design/content. Do not update or validate the production store against an old preview URL.

## Future-model instructions

Before changing APK STORE Android code:

- Read this file first.
- Keep package ID and namespace exactly `com.apkstore.client`.
- Keep the APK STORE client catalog slug exactly `apk-store-client`.
- Increment `versionCode` for every production APK.
- Reuse the permanent signing keystore; never create a replacement key unless the owner explicitly accepts breaking update compatibility.
- Verify the signer SHA-256 matches `CD:5F:FF:73:67:5C:8C:78:3D:B5:1A:33:00:CC:06:84:57:63:21:5D:2C:7B:03:A6:4A:E7:F9:B5:89:36:05:85`.
- Build/test before claiming completion.
- Verify the final APK with `aapt dump badging`/`aapt2` and `apksigner verify --print-certs`.
- Do not publish a candidate release until real-device smoke testing has passed.

## Update checking already in the app

The Android client contains an Updates tab and update-detection logic for installed catalog apps. It compares installed package versionCode to published release versionCode, excludes ignored/blacklisted apps, shows available updates, and supports Update all. A WorkManager background worker periodically checks updates. Update interval values are normalized before scheduling so invalid persisted values cannot crash WorkManager setup.

This catalog update checker is separate from Android package-signing compatibility. Signing compatibility is controlled by the permanent rules above.
