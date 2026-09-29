# APK STORE — Permanent Android Update Identity

This file is the source of truth for every future APK STORE Android build.

## Permanent identity

- App name: APK STORE
- Android package / applicationId: `com.apkstore.client`
- Android namespace: `com.apkstore.client`
- Current baseline versionCode: `14`
- Current baseline versionName: `1.1.6`
- minSdk: `26`
- targetSdk: `35`
- compileSdk: `35`

## Permanent production signing certificate

The permanent APK STORE release keystore (`apkstore-release`) is the sole signing identity for all production releases. The private keystore is intentionally NOT committed to this public repository.

- Key alias: `apkstore-release`
- Certificate SHA-256: `CD:5F:FF:73:67:5C:8C:78:3D:B5:1A:33:00:CC:06:84:57:63:21:5D:2C:7B:03:A6:4A:E7:F9:B5:89:36:05:85`
- Certificate SHA-1: `A8:B0:96:B0:F6:C5:85:91:B9:CE:2A:8F:01:10:A7:DE:D7:E8:F8:38`

This certificate signed the verified 1.1.6 (versionCode 14) production release (APK SHA-256 `545cff23fa9e0519c85c7c24d956a4b9b63ac97b60b2743141bef01cfcd9ff0e`).

OBSOLETE — do NOT use: `11:A0:A7:D5:01:74:0A:96:ED:C1:40:89:7C:2F:45:C2:72:EC:08:25:D4:E9:A3:F8:66:D5:EF:32:96:25:78:80`. This fingerprint was recorded here earlier by mistake and never signed a production release.

Every official APK STORE production APK must be signed by the private key whose certificate matches the SHA-256 fingerprint above. If a future APK reports a different signing certificate, do not install/distribute it as an update.

## Never change these update-identity rules

1. Never change `applicationId 'com.apkstore.client'`.
2. Never add an `applicationIdSuffix` to a production build.
3. Every production update must use a `versionCode` greater than every previously installed/distributed production version.
4. Every production update must be signed by the SAME permanent APK STORE release keystore.
5. Never commit the release keystore or its passwords to this public repository.
6. Do not distribute `app-release-unsigned.apk` as an update.
7. Do not use a newly generated debug keystore for production updates.

If the package ID and signing certificate stay the same and the new versionCode is higher, Android can install the APK as an update over the existing APK STORE installation.

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

The keystore must be backed up safely and reused forever for APK STORE production updates.

## GitHub Actions release build

Normal pushes run tests and produce a debug APK.

To create an official signed APK STORE release, run the `Build APK STORE Android` workflow manually after the four signing secrets are configured. The workflow:

1. restores the permanent keystore from the encrypted GitHub secret,
2. builds the signed release,
3. verifies package ID `com.apkstore.client`,
4. verifies the APK signature,
5. outputs the signer certificate information,
6. outputs the APK SHA-256,
7. uploads `APK-STORE-signed.apk` as an artifact.

## Verified production release (1.1.6)

- Package: `com.apkstore.client`, versionName `1.1.6`, versionCode `14`
- APK size: 667246 bytes
- APK SHA-256: `545cff23fa9e0519c85c7c24d956a4b9b63ac97b60b2743141bef01cfcd9ff0e`
- Signer SHA-256: `cd5fff73675c8c783db51a3300cc06845763215d2c7b03a64ae7f9b589360585` (matches the permanent certificate above)
- Supabase catalog slug: `apk-store-client`, storage object `apk-store-client/1.1.6.apk` (bucket `apk-files`)
- Download endpoint: `https://qfbfxencwsgryoczkdyj.supabase.co/functions/v1/download-apk?slug=apk-store-client`

## Future-model instructions

Before changing APK STORE Android code:

- Read this file first.
- Keep package ID and namespace exactly `com.apkstore.client`.
- Increment `versionCode` for every production APK.
- Reuse the permanent signing keystore; never create a replacement key unless the owner explicitly accepts breaking update compatibility.
- Verify the signer SHA-256 matches `CD:5F:FF:73:67:5C:8C:78:3D:B5:1A:33:00:CC:06:84:57:63:21:5D:2C:7B:03:A6:4A:E7:F9:B5:89:36:05:85`.
- Build/test before claiming completion.
- Verify the final APK with `aapt dump badging` and `apksigner verify --print-certs`.

## Update checking already in the app

The Android client already contains an Updates tab and update-detection logic for installed catalog apps. It compares the installed package versionCode to the published release versionCode, excludes ignored/blacklisted apps, shows the number of available updates, and has an Update all action. A WorkManager background worker periodically checks updates; the default interval is 12 hours unless the user changes the update interval setting.

This catalog update checker is separate from Android package-signing compatibility. Signing compatibility is controlled by the permanent rules above.

## Security notes

- An old Supabase publishable key was committed in git history (`apps/android/gradle.properties`). Key rotation and git-history purge are pending owner approval. Do not treat the history as clean.
- Never commit the release keystore, signing passwords, GitHub Actions secret values, Supabase service-role keys, or other private credentials to this repository.
- Only certificate fingerprints and other public metadata may appear in docs and reports.

## Crash reporting status (2026-09-30)

- The `crash-report` Supabase edge function is deployed and responding (`{"error":"POST required"}` on GET).
- The `crash_reports` table migration (RLS, no public write policy) is not in `supabase/migrations/`; its deployment status in Supabase is unverified.
- The Android client does not yet send crash reports; client-side reporting is not implemented.
