# APK STORE Self-Update, Permanent Identity, and Crash Reporting Design

Date: 2026-09-29
Branch: `fix/full-audit-20260929`

## Context

APK STORE is still in private testing. It has not been distributed to customers yet, so there is no installed-customer migration constraint. This is the right point to establish the permanent Android identity and signing key before public release.

Current Android identity is `com.apkstore.client`. This design keeps that application ID permanently and makes every future APK STORE build/update use the same signing certificate.

This feature set extends the existing full-system audit without redesigning the current UI.

## Goals

1. Make `com.apkstore.client` the permanent package/application ID for APK STORE.
2. Establish one permanent release signing key before public distribution.
3. Add a real self-update flow inside APK STORE, including About -> Check for updates.
4. Publish APK STORE itself through the same trusted catalog/release system used by other apps.
5. Ensure an update can only install if package ID, version code, SHA-256, and signing certificate are valid.
6. Add first-party crash reporting without Firebase or a third-party analytics SDK.
7. Surface crash reports and crash status in the owner/admin panel.
8. Preserve user privacy by collecting only technical crash diagnostics required to fix defects.
9. Keep all existing store features, data, and UI behavior intact.

## Non-goals

- No silent background installation.
- No automatic install without Android user confirmation.
- No analytics, advertising, contact collection, user files, messages, location, account data, or browsing history collection.
- No remote-control functionality.
- No redesign of the store UI or admin UI beyond small functional additions required for update/crash status.

## Permanent Android Identity

The permanent application ID is:

`com.apkstore.client`

It remains checked into `apps/android/app/build.gradle` and is treated as immutable after public release.

A checked-in build constant will identify the store package where update logic needs to distinguish APK STORE from ordinary catalog apps. The catalog entry for APK STORE must also use `package_id = com.apkstore.client` and stable slug `apk-store`.

All version comparisons use integer `versionCode`, never `versionName` string ordering.

## Permanent Signing

Because the app is still private testing, create a new permanent release keystore now and use it for the first public APK STORE release.

Rules:

- The private keystore and passwords must never be committed to Git.
- GitHub Actions stores the keystore/passwords as encrypted repository secrets.
- The public SHA-256 signing certificate fingerprint may be committed and stored in Supabase for verification.
- Release builds fail closed if signing secrets are missing; no unsigned APK is treated as a public release.
- Every future APK STORE update must be signed with this same certificate.
- The debug key remains test-only and must never become the public release identity.
- The owner keeps a separate offline backup of the permanent keystore; losing it would prevent compatible future updates to installed public builds.

Because there are no customers yet, changing from the current test/debug signer to the new permanent signer does not require migration. Existing local test installations can be uninstalled/reinstalled once if Android rejects the signer change.

## APK STORE Catalog Entry

APK STORE itself will have a normal app row/release row in the backend, but with extra protections:

- `package_id` must equal `com.apkstore.client`.
- New releases require a strictly larger integer `version_code`.
- Signer SHA-256 must equal the permanent APK STORE certificate fingerprint.
- APK SHA-256 and byte size must match inspection metadata.
- Publish is rejected if package ID or signer does not match.
- The current published release is the canonical source for self-update checks.

This avoids a separate update server and keeps one source of truth.

## Android Self-Update Flow

### About screen

Add a functional row:

- `Check for updates`

The screen also shows:

- installed version name
- installed version code
- package ID
- last update-check result/time where useful

### Manual check

When the user taps Check for updates:

1. Refresh the APK STORE catalog/release entry from the existing HTTPS backend.
2. Validate response belongs to `com.apkstore.client`.
3. Compare remote integer `version_code` with `BuildConfig.VERSION_CODE`.
4. If no update: show `You're up to date` plus current version.
5. If update exists: show version, file size, release notes, and an Update button.
6. Download through the existing trusted download path.
7. Verify downloaded size and SHA-256.
8. Verify APK package ID is `com.apkstore.client`.
9. Verify APK signing certificate matches the permanent fingerprint.
10. Launch Android's normal package installer for user confirmation.
11. Never silently install.

### Background check

Existing WorkManager update scheduling may also check APK STORE's own release. If a newer store version exists, it may post a normal Android notification when notification permission is available. It must not download/install silently.

Network failures must show a retry/error state and not crash.

## Release Build Pipeline

GitHub Actions remains the canonical Android build pipeline.

Release pipeline requirements:

- Build/tests must pass before release artifact creation.
- Decode/load permanent signing key only in CI memory/workspace.
- Sign release APK with permanent key.
- Verify the signed APK with `apksigner verify --print-certs`.
- Verify package ID/version metadata before publication.
- Emit SHA-256, byte size, version name/code, and signer fingerprint as release metadata.
- Upload/publish only the signed APK, never `app-release-unsigned.apk` as a customer release.
- Keep test/debug artifact separate and clearly named.

## Crash Reporting Architecture

Use a first-party Supabase-backed crash reporter instead of Firebase Crashlytics.

### On-device capture

A small `CrashReporter` component installs an uncaught-exception handler early in app startup.

On an uncaught exception it performs only local, bounded file I/O before delegating to the previous/default handler. It must not attempt a network request while the process is crashing.

It records a compact JSON event in app-private storage containing only:

- package ID
- app version name/code
- Android SDK/version
- device manufacturer/model
- exception class
- sanitized exception message
- stack trace
- crash timestamp
- deterministic crash fingerprint derived from exception type + stable top stack frames

It does not collect contacts, files, media, clipboard, precise location, advertising identifiers, account data, messages, or browsing history.

### Upload behavior

On the next successful app launch:

1. Read queued crash reports from app-private storage.
2. POST them over HTTPS to a public-but-rate-limited crash ingest Edge Function.
3. The function validates schema/lengths/version fields and rejects oversized or malformed payloads.
4. On successful server acknowledgement, delete the local queued file.
5. On network/server failure, keep it for a later retry.
6. Keep at most 10 pending crash files and delete local reports older than 30 days.

No persistent device identifier is required. Admin reporting therefore shows report counts and affected device models/Android versions, not a claimed count of unique people.

## Crash Backend Schema

Add three RLS-protected tables.

### `crash_issues`

One aggregate row per fingerprint:

- `fingerprint` primary key
- `package_id`
- `title`
- `exception_class`
- `status` (`open`, `resolved`, `ignored`)
- `first_seen_at`
- `last_seen_at`
- `event_count`
- `latest_version_code`
- `latest_version_name`
- `updated_at`

Public clients get no direct table access.

### `crash_events`

One bounded event per report:

- `id`
- `fingerprint`
- `package_id`
- `version_code`
- `version_name`
- `android_sdk`
- `device_manufacturer`
- `device_model`
- `exception_class`
- `message`
- `stack_trace`
- `occurred_at`
- `received_at`

Foreign key links to `crash_issues.fingerprint`.

### `crash_ingest_limits`

Short-lived rate-limit state:

- `client_key` primary key, containing only an HMAC/SHA-256 token derived server-side from request IP plus a server-only salt, never the raw IP
- `window_started_at`
- `request_count`
- `expires_at`

Rows expire after 24 hours and are inaccessible to anon clients.

## Crash Ingest Edge Function

A new `report-crash` Edge Function accepts anonymous app reports because customers will not sign in.

Security requirements:

- HTTPS only.
- POST only.
- strict JSON schema and length limits.
- accepted package ID allowlist initially contains only `com.apkstore.client`.
- accepted app version fields must be sane positive integers/short strings.
- stack trace maximum 32 KiB after truncation; exception message maximum 2 KiB; entire request body maximum 48 KiB.
- server-side rate limit: maximum 20 accepted crash reports per derived client key per rolling hour; excess requests return 429.
- raw client IP is never persisted; only the server-derived short-lived rate-limit token is stored.
- service-role key used only server-side.
- anon clients cannot select crash tables.

The function inserts `crash_events` and upserts/increments `crash_issues` by fingerprint.

## Admin Crash Dashboard

Add an authenticated owner-only admin route/screen named `Crashes`.

Dashboard displays:

- open issue count
- reports in recent period
- top crash fingerprints
- exception/title
- affected APK STORE versions
- affected Android versions/device models
- first seen / last seen
- report count
- latest sanitized stack trace
- status: Open / Resolved / Ignored

Actions:

- Mark Resolved
- Re-open
- Ignore

Every state-changing action checks owner authorization server-side and is audit logged.

No crash table is readable from the public browser/client without owner authorization.

## Admin APK STORE Update Management

Add a small APK STORE-specific owner section without redesigning the panel.

It shows:

- package ID: `com.apkstore.client`
- current published version
- latest uploaded/inspected version
- permanent signer fingerprint
- APK SHA-256 and size
- release notes
- publish state

Publishing a new APK STORE release uses the existing upload -> inspection -> review -> publish pipeline and adds the hard checks for package ID and permanent signer.

## Privacy Policy Change

The current Android privacy copy says there are no analytics SDKs. Keep that true.

Update the policy to disclose first-party diagnostic crash reporting:

- what technical fields are sent
- why they are sent (stability/debugging)
- that no third-party analytics SDK is used
- that crash reports do not intentionally include user files/messages/contacts/location
- provider/service logging may still process IP/network metadata at infrastructure level
- raw IP is not stored in APK STORE crash tables; a short-lived derived token is used only for abuse throttling

## Error Handling

Self-update:

- offline -> clear retry state
- malformed backend response -> reject update
- wrong package ID -> reject update
- wrong signer -> reject update
- SHA/size mismatch -> delete/reject download
- installer cancelled -> keep app usable and report Cancelled

Crash reporting:

- crash capture failure must never replace the original crash flow
- upload failure leaves report queued
- malformed local event is discarded safely
- server errors do not block app startup
- 429 leaves the local report queued for a later retry

## Testing Strategy

### Android unit/build tests

- package ID constant remains `com.apkstore.client`
- integer update version comparison
- update available/no-update/error states
- wrong package ID rejection
- wrong signer rejection
- SHA-256 mismatch rejection
- crash fingerprint stability
- crash payload sanitization/size bounds
- crash queue 10-file cap, 30-day retention, and retry behavior
- debug + signed release build

### CI/release verification

- `apksigner verify --print-certs` succeeds
- release APK package ID equals `com.apkstore.client`
- signer fingerprint equals expected permanent fingerprint
- versionCode is greater than previous published APK STORE release
- SHA-256 matches published metadata

### Backend tests

- unauthenticated direct crash table reads fail
- crash ingest accepts a valid bounded event
- malformed/oversized event is rejected
- 21st accepted request within an hour for one derived client key is rejected with 429
- raw client IP is never stored in crash tables/rate-limit rows
- admin crash endpoints reject unauthenticated/expired sessions
- issue status update is owner-only
- APK STORE publish rejects wrong package/signing certificate

### End-to-end pre-release verification

Because there are no customers yet, perform one clean baseline install using the permanent release signer, then build a higher versionCode with the same key and verify:

1. About -> Check for updates detects it.
2. Download succeeds.
3. hash/signer/package checks pass.
4. Android presents the update installer.
5. update installs over the old permanent-signer build.
6. deliberately wrong signer/package test APK is rejected before install.
7. intentional test crash is captured locally, uploaded on next launch, and appears in Admin -> Crashes.

Actual physical-device/OEM testing must be reported honestly; CI/emulator results are not described as real-device tests.

## Rollout Order

1. Permanent identity/signing infrastructure.
2. APK STORE catalog/release protections.
3. Android self-update flow.
4. Crash DB/schema + ingest function.
5. Android crash reporter.
6. Admin APK STORE update section.
7. Admin crash dashboard.
8. Privacy copy update.
9. Full CI + end-to-end verification.
10. Only after all required checks are green, merge into `main` and produce the signed test/release APK.

## Acceptance Criteria

The work is complete only when all of the following have fresh verification evidence:

- APK STORE application ID is still `com.apkstore.client`.
- A permanent non-debug release signer is established.
- About contains a working Check for updates action.
- An APK STORE release with larger versionCode can update an older permanent-signer APK STORE install.
- Wrong signer/package/hash is rejected.
- APK STORE releases are published through the trusted inspected catalog path.
- A controlled crash is queued locally, reported after restart, and visible in authenticated admin Crashes.
- Admin can mark a crash issue Resolved/Re-open/Ignored.
- Public/anon clients cannot query crash tables directly.
- Privacy copy accurately describes first-party crash diagnostics.
- Android tests/build, web unit/typecheck/build, backend tests, and relevant workflow checks pass.
- No claim of real-device compatibility is made for device/OEM combinations that were not actually tested.
