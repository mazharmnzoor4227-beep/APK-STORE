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

A new permanent APK STORE release keystore was created for the post-reset production line. The private keystore is intentionally NOT committed to this public repository.

- Key alias: `apkstore-release`
- Certificate SHA-256: `11:A0:A7:D5:01:74:0A:96:ED:C1:40:89:7C:2F:45:C2:72:EC:08:25:D4:E9:A3:F8:66:D5:EF:32:96:25:78:80`
- Certificate SHA-1: `C5:54:BE:7E:1E:EC:FF:8D:2E:4F:6C:58:EC:5E:C2:A9:43:96:4D:8B`

Every official APK STORE production APK installed after the old app is removed must be signed by the private key whose certificate matches the SHA-256 fingerprint above. If a future APK reports a different signing certificate, do not install/distribute it as an update.

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

## Future-model instructions

Before changing APK STORE Android code:

- Read this file first.
- Keep package ID and namespace exactly `com.apkstore.client`.
- Increment `versionCode` for every production APK.
- Reuse the permanent signing keystore; never create a replacement key unless the owner explicitly accepts breaking update compatibility.
- Verify the signer SHA-256 matches `11:A0:A7:D5:01:74:0A:96:ED:C1:40:89:7C:2F:45:C2:72:EC:08:25:D4:E9:A3:F8:66:D5:EF:32:96:25:78:80`.
- Build/test before claiming completion.
- Verify the final APK with `aapt dump badging` and `apksigner verify --print-certs`.

## Update checking already in the app

The Android client already contains an Updates tab and update-detection logic for installed catalog apps. It compares the installed package versionCode to the published release versionCode, excludes ignored/blacklisted apps, shows the number of available updates, and has an Update all action. A WorkManager background worker periodically checks updates; the default interval is 12 hours unless the user changes the update interval setting.

This catalog update checker is separate from Android package-signing compatibility. Signing compatibility is controlled by the permanent rules above.
