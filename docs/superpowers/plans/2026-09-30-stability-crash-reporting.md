# APK STORE Stability & Crash Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the post-reset APK STORE production line launch-safe, wire crash reporting correctly, preserve permanent update identity, and produce a verifiable v1.1.7 signed candidate.

**Architecture:** Move uncaught-crash capture out of `MainActivity` into an application-level reporter that persists a sanitized report synchronously, then uploads it on a later healthy process via WorkManager. Keep catalog/update/install behavior intact, harden WorkManager initialization, align the Edge Function and database migration, and make CI enforce the permanent signer.

**Tech Stack:** Android Java 17, AndroidX WorkManager, Supabase Edge Functions/Postgres, GitHub Actions.

**Spec:** `docs/ANDROID_UPDATE_IDENTITY.md`

## Global Constraints

- Package/applicationId and namespace stay exactly `com.apkstore.client`.
- Permanent signer SHA-256 stays `CD:5F:FF:73:67:5C:8C:78:3D:B5:1A:33:00:CC:06:84:57:63:21:5D:2C:7B:03:A6:4A:E7:F9:B5:89:36:05:85`.
- Next production candidate is `versionName 1.1.7`, `versionCode 15`.
- No keystore or signing secret enters source control.
- Crash uploads must not block startup or the fatal exception path.

## Review Focus

- WorkManager missing/late initialization must not crash app launch.
- Fatal crash capture must persist before process death and upload only after a healthy restart.
- Crash payload must exactly match the Edge Function schema and contain no secret/user-content fields beyond sanitized exception metadata.
- Failed/offline uploads must retry without losing the queued report or causing a crash loop.
- Release CI must reject any signer other than the permanent certificate.

---

### Task 1: Preserve main-branch production metadata

**Files:**
- Modify: `docs/ANDROID_UPDATE_IDENTITY.md`
- Add/keep: `index.html`

- [ ] Correct SHA-1 from the actual signed APK artifact and add DN/RSA size.
- [ ] Correct crash-reporting status and security note to reflect live backend facts.
- [ ] Preserve GitHub Pages root redirect from `main`.

### Task 2: Add crash-reporting regression tests first

**Files:**
- Create: `apps/android/app/src/test/java/com/apkstore/client/CrashReporterTest.java`
- Create: `apps/android/app/src/test/java/com/apkstore/client/WorkManagerPolicyTest.java`

- [ ] Test canonical payload field names, fingerprint stability, truncation/redaction, queue retention, and success deletion behavior.
- [ ] Test update interval clamping and WorkManager initialization policy helpers.

### Task 3: Implement application-level crash persistence and deferred upload

**Files:**
- Create: `apps/android/app/src/main/java/com/apkstore/client/ApkStoreApplication.java`
- Create: `apps/android/app/src/main/java/com/apkstore/client/CrashReporter.java`
- Create: `apps/android/app/src/main/java/com/apkstore/client/CrashReportWorker.java`
- Modify: `apps/android/app/src/main/AndroidManifest.xml`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java`

- [ ] Install global handler in `Application`.
- [ ] Persist JSON report synchronously to private app storage.
- [ ] Queue WorkManager upload on healthy startup; retry on network/server failure.
- [ ] Remove fire-and-forget network thread from fatal exception handler.

### Task 4: Harden WorkManager/update scheduling and canonical site URL

**Files:**
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/SettingsStore.java`
- Modify: `apps/android/app/build.gradle`

- [ ] Centralize safe WorkManager initialization.
- [ ] Clamp periodic intervals to valid values.
- [ ] Set canonical `SITE_URL` to GitHub Pages store URL.
- [ ] Bump candidate version to 1.1.7/15.

### Task 5: Put live crash backend under source control

**Files:**
- Create: `supabase/functions/crash-report/index.ts`
- Create: `supabase/functions/crash-report/crash-payload.mjs`
- Create: `supabase/functions/crash-report/crash-payload.test.mjs`
- Create: `supabase/migrations/20260930_crash_reporting.sql`

- [ ] Use server-derived rate key and `record_crash_report_v2`.
- [ ] Keep RLS/no public table writes and sanitized bounded payloads.
- [ ] Make migration idempotently reflect the deployed crash schema.

### Task 6: Enforce release identity in CI

**Files:**
- Modify: `.github/workflows/build-android.yml`

- [ ] Verify package, versionName/versionCode, exact signer SHA-256, APK SHA-256 and byte size.
- [ ] Keep release build manual-only and secrets non-printing.

### Task 7: Verify end to end

- [ ] Run Android unit tests and debug build in CI.
- [ ] Run Edge payload tests.
- [ ] Exercise crash-report endpoint with a synthetic non-user crash payload and verify a backend event is recorded.
- [ ] Run manual signed release workflow and inspect `aapt`/`apksigner` outputs.
- [ ] Do not publish v1.1.7 to the catalog until a physical-device launch/smoke test is confirmed.
