# APK STORE permanent release signing

The public Android identity for APK STORE is permanently fixed to:

- Application/package ID: `com.apkstore.client`
- Catalog slug: `apk-store`
- Release certificate SHA-256: `4c8a4d67022c354b62db264461e0d4f9cc16f6ea3c0cbce204fb7a9f7708ac60`

The private release keystore and its passwords must never be committed to this repository.

The `Build APK STORE Android` workflow signs customer releases on `main` only when these encrypted GitHub Actions secrets are present:

- `APK_STORE_KEYSTORE_B64`
- `APK_STORE_KEYSTORE_PASSWORD`
- `APK_STORE_KEY_ALIAS`
- `APK_STORE_KEY_PASSWORD`

The workflow verifies the resulting APK certificate against the public SHA-256 above and verifies package ID `com.apkstore.client` before publishing the signed artifact. Missing signing secrets fail closed; an unsigned APK is never presented as the customer release artifact.

Keep an offline backup of the private keystore. Losing the permanent key prevents future in-place updates for users who installed releases signed by it.
