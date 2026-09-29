# APK STORE Permanent Signing and Self-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `com.apkstore.client` the permanent APK STORE identity, create a permanent signed release pipeline, and add a verified in-app self-update flow under About -> Check for updates.

**Architecture:** Keep the existing Supabase catalog as the update source of truth. Add small Android units for update decision and APK verification instead of growing `MainActivity`, and harden CI so public release artifacts are signed and verified before publication.

**Tech Stack:** Android Java 17, Gradle 8.11.1, PackageManager/PackageInstaller flow already in project, WorkManager, Supabase REST/Edge Functions, GitHub Actions, `apksigner`.

**Spec:** `docs/superpowers/specs/2026-09-29-apk-store-self-update-crash-reporting-design.md`

## Global Constraints

- Permanent application ID is exactly `com.apkstore.client`.
- Version comparisons use integer `versionCode`, never `versionName` ordering.
- No silent install; Android user confirmation is always required.
- Private keystore/passwords are never committed to Git.
- Wrong package ID, signer, hash, size, or malformed metadata must fail closed.
- Current UI stays intact except the small About/update additions.
- Existing catalog/download/install behavior must remain working.

## Review Focus

- A remote release with a larger version name but lower/equal integer `version_code` must not be offered.
- An APK with correct package ID but wrong signing certificate must be rejected before install.
- A valid update interrupted by poor network must remain retryable and must not corrupt the installed app.
- Missing signing secrets must fail release CI rather than emit a customer-ready unsigned APK.
- APK STORE catalog metadata must never accidentally point self-update to another package/slug.

---

### Task 1: Lock permanent app identity and update policy

**Files:**
- Modify: `apps/android/app/build.gradle`
- Create: `apps/android/app/src/main/java/com/apkstore/client/StoreIdentity.java`
- Create: `apps/android/app/src/main/java/com/apkstore/client/StoreUpdatePolicy.java`
- Test: `apps/android/app/src/test/java/com/apkstore/client/StoreUpdatePolicyTest.java`

**Interfaces:**
- Produces: `StoreIdentity.PACKAGE_ID`, `StoreIdentity.CATALOG_SLUG`, `StoreUpdatePolicy.isUpdateAvailable(long installed, long remote)`.

- [ ] **Step 1: Write failing tests** asserting package ID `com.apkstore.client`, slug `apk-store`, and update=true only when `remoteVersionCode > installedVersionCode`.
- [ ] **Step 2: Run** `gradle --no-daemon :app:testDebugUnitTest` from `apps/android`; expected FAIL because the new classes do not exist.
- [ ] **Step 3: Implement** the two focused classes and add checked-in non-secret expected signer fingerprint build constant placeholder/config hook in `build.gradle`.
- [ ] **Step 4: Run** `gradle --no-daemon :app:testDebugUnitTest`; expected PASS.
- [ ] **Step 5: Commit** `feat: lock apk store identity and update policy`.

### Task 2: Verify downloaded APK STORE updates before install

**Files:**
- Create: `apps/android/app/src/main/java/com/apkstore/client/ApkUpdateVerifier.java`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java`
- Test: `apps/android/app/src/test/java/com/apkstore/client/ApkUpdateVerifierTest.java`

**Interfaces:**
- Consumes: `StoreIdentity.PACKAGE_ID` and expected signer fingerprint.
- Produces: `ApkUpdateVerifier.Result verify(File apk, String expectedSha256, long expectedSize)` with explicit failure reason.

- [ ] **Step 1: Write failing tests** for hash mismatch, size mismatch, package mismatch, signer mismatch, and valid metadata decision helpers.
- [ ] **Step 2: Run** Android unit tests; expected FAIL because verifier is absent.
- [ ] **Step 3: Implement** verifier using SHA-256 plus PackageManager archive metadata/signing certificate APIs with Android-version guards.
- [ ] **Step 4: Wire** the existing downloaded/open-install path so APK STORE self-updates call verifier before installer launch; rejected files are deleted/marked failed with the real reason.
- [ ] **Step 5: Run** `gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug`; expected PASS.
- [ ] **Step 6: Commit** `fix: verify apk store updates before install`.

### Task 3: Add About -> Check for updates

**Files:**
- Create: `apps/android/app/src/main/java/com/apkstore/client/SelfUpdateRepository.java`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/UpdateCheckWorker.java`
- Test: `apps/android/app/src/test/java/com/apkstore/client/SelfUpdateRepositoryTest.java`

**Interfaces:**
- Produces: a parsed update model containing slug/package/version code/name, size, SHA-256, release notes, download path metadata.

- [ ] **Step 1: Write failing parser/policy tests** for valid `apk-store`, wrong package, malformed release, equal/lower version, and newer version.
- [ ] **Step 2: Run** unit tests; expected FAIL.
- [ ] **Step 3: Implement** `SelfUpdateRepository` against the existing HTTPS Supabase catalog response, rejecting any row not matching `apk-store` + `com.apkstore.client`.
- [ ] **Step 4: Add** About row `Check for updates`, installed version code/package display, loading/up-to-date/update/error states, and Update action reusing existing download/install flow.
- [ ] **Step 5: Extend** WorkManager update check so it may notify for a newer APK STORE version but never downloads/installs silently.
- [ ] **Step 6: Run** `gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease`; expected PASS.
- [ ] **Step 7: Commit** `feat: add verified apk store self-update`.

### Task 4: Protect APK STORE publication in backend/admin flow

**Files:**
- Create: `supabase/migrations/20260929_apk_store_release_guards.sql`
- Modify: `supabase/functions/admin-upload/index.ts`
- Modify: `apps/web/lib/apk/inspection.ts`
- Test: `apps/web/tests/upload.test.ts`
- Test/Create: `supabase/tests/apk_store_release_guards.sql`

**Interfaces:**
- Produces backend rejection for `apk-store` release if package ID != `com.apkstore.client`, signer fingerprint mismatches permanent fingerprint, or `version_code` is not strictly increasing.

- [ ] **Step 1: Add failing web/backend tests** covering wrong package, wrong signer, and non-increasing version.
- [ ] **Step 2: Run** `npm run test:unit` in `apps/web`; expected FAIL for missing guard behavior.
- [ ] **Step 3: Implement** validation in publish/inspection path and DB guard/RPC constraint without changing rules for other catalog apps.
- [ ] **Step 4: Run** web unit tests/typecheck/build and Supabase SQL tests available in repo; expected PASS.
- [ ] **Step 5: Commit** `feat: protect apk store release identity`.

### Task 5: Permanent signed GitHub Actions release pipeline

**Files:**
- Modify: `.github/workflows/build-android.yml`
- Create: `apps/android/signing/README.md`

**Interfaces:**
- Consumes encrypted GitHub secrets for base64 keystore, alias, key/store passwords.
- Produces signed `APK-STORE-release.apk`, signer fingerprint, SHA-256, size, version metadata; no public unsigned release artifact.

- [ ] **Step 1: Add CI validation steps** that fail if signing secrets are absent on a release/publish job and verify application ID/version/signer after signing.
- [ ] **Step 2: Keep** branch/debug CI able to run tests without exposing/requiring production key, but clearly separate it from public release job.
- [ ] **Step 3: Use** `apksigner verify --verbose --print-certs` and compare signer SHA-256 to the configured expected public fingerprint.
- [ ] **Step 4: Generate** SHA-256/size/version metadata and upload only the signed customer release artifact under an unambiguous name.
- [ ] **Step 5: Run** branch CI and inspect all job steps; expected unit/build checks green. Secret-dependent release signing is only claimed verified after secrets exist and the signed job itself passes.
- [ ] **Step 6: Commit** `ci: add permanent signed apk store releases`.

### Task 6: Self-update end-to-end verification

**Files:**
- Modify as needed only for failures discovered by tests.
- Update: `docs/APK-STORE_FULL_AUDIT_REPORT.md`

- [ ] **Step 1: Build/install baseline permanent-signer APK** once signing secret setup is available.
- [ ] **Step 2: Build a higher `versionCode` with the same signer** and publish it as APK STORE current release.
- [ ] **Step 3: Verify** About -> Check for updates detects it, downloads, validates hash/package/signer, and Android presents an update install rather than separate-app install.
- [ ] **Step 4: Verify** deliberately wrong package/signer/hash fixtures are rejected before installer launch.
- [ ] **Step 5: Run** full Android CI and record run IDs/artifact hashes in audit report.
- [ ] **Step 6: Commit** `docs: verify apk store self-update flow`.
