# APK STORE full-system repair implementation plan

> Execution rule: use the audit in `docs/audits/2026-09-29-full-system-audit.md` as the baseline, change one milestone at a time, write regression tests before behavior changes where practical, run full affected test/build commands after each milestone, and do not claim device behavior that CI cannot prove.

**Goal:** Repair the real production failures across Supabase/backend, Android store app and owner/admin panel without redesigning the existing UI or losing catalog data.

**Architecture direction:** Keep Supabase as the database/security boundary. Keep public catalog reads behind RLS. Keep APK verification in Android. Move CPU/memory-heavy APK inspection away from Supabase Edge runtime to GitHub Actions/runner-class infrastructure; Edge/Next endpoints should orchestrate and authorize rather than parse 100–300 MiB APKs. Prefer durable Supabase-hosted icon/screenshot URLs over fragile upstream hotlinks.

## Milestone 0 — guardrails and regression evidence

1. Add tests for Android API-level display mapping before changing the chip.
2. Add tests for trusted screenshot URLs / image policy.
3. Add backend tests that publication cannot silently create a new app with no usable icon.
4. Add tests for the inspector callback schema including icon/SDK/permissions/ABI fields.
5. Add a CI-safe catalog integrity checker for published rows, hashes/sizes and storage-backed media references.
6. Run existing Android + web unit tests and record baseline failures before fixes.

## Milestone 1 — backend/icon reliability (Part A priority)

1. Repair the concrete broken URLCheck icon source and verify the proxy no longer returns 502.
2. Change `app-icon` to opportunistically persist successfully fetched upstream icons into `app-icons` and update `apps.icon_url` to an immutable public storage URL, reducing repeated proxy dependency.
3. Add a safe owner-only/backfill mode that walks proxy-backed icons, persists reachable ones and reports failures without deleting data.
4. Add cleanup/status handling for expired `uploading` candidates (mark stale/rejected only under an explicit expiry rule; never delete releases/apps).
5. Add rate limiting / abuse controls to public download/icon endpoints with conservative limits and clear 429 responses.
6. Re-run production-log checks after deploy.

## Milestone 2 — canonical APK inspection and 300 MiB upload

1. Extend inspection metadata type/schema to include `minSdk`, `targetSdk`, `permissions`, `abis`, and extracted icon artifact metadata.
2. Make GitHub Actions the canonical heavy inspector: fetch candidate safely, run `apkanalyzer`/`apksigner`, hash file, resolve launcher icon (including adaptive/vector fallback), rasterize to WebP/PNG under 1 MiB, upload it, and callback with all metadata.
3. Stop doing full APK hash/parse inside `admin-upload?action=inspect`; make it orchestrate/queue canonical inspection instead so 300 MiB APKs do not hit Edge resource limits.
4. Consolidate upload orchestration so small APKs use private Supabase storage, large APKs use R2, but both feed the same inspector.
5. Publish must require completed inspection and a real durable icon for new apps, unless an explicit owner-uploaded replacement is provided.
6. Add retry/cancel/discard cleanup that works for both Supabase and R2 candidates.

## Milestone 3 — Android correctness fixes

1. Add `AndroidVersionLabel` mapping for API levels through current stable Android and future-safe fallback (`API 36` → Android 16; unknown higher values display `API N+`, never fake an Android OS number).
2. Replace raw `Android <minSdk>+` chip with mapped label.
3. Fix screenshot policy: accept only trusted HTTPS hosts/paths or durable Supabase media; do not silently skip valid catalog screenshots.
4. Replace root-store share text with an app-specific canonical URL/content.
5. Make `Update all` a sequential queue with per-app result and failure continuation.
6. Preserve per-tab scroll position.
7. Improve cancelled/failed download cleanup and keep real app titles in history.
8. Add background update notification with Android 13+ notification permission and Settings toggle.
9. Run Android unit tests + debug/release builds.

## Milestone 4 — admin authentication and owner UX

1. Replace OTP-only login UI with Supabase email/password sign-in, keep `requireOwner()` server authorization, add persistent session and sign-out.
2. Add drag/drop + browse + real XHR progress + AbortController/XHR abort for cancel.
3. Show automatic inspection state/polling and specific errors.
4. Expand review form: APK icon preview/reset, manual replace, short description, license, min SDK, source/F-Droid, screenshots add/reorder/remove, recommendation, price type, release notes, save draft/publish/discard.
5. Add Apps list search/filter/sort, copy package ID/download link, open in store, edit, upload new version, hide/publish, delete.
6. Add Trash restore/delete-forever UI backed by verified storage cleanup.
7. Add Queue states/history/retry/reinspect/cancel/discard.
8. Add owner Settings with theme persistence, password change and a real catalog refresh action.

## Milestone 5 — cross-system + storage consistency

1. Add automated E2E fixture flow: upload controlled APK → inspect → publish → public catalog → icon/screenshot metadata.
2. Test unpublish while detail data is cached; Android should show “This app is no longer available” after refresh rather than crash.
3. Test new version produces update state with integer version code.
4. Ensure icon replacements use immutable/versioned URLs so Android disk cache refreshes.
5. Add storage integrity job for Supabase + R2 HEAD checks and external trusted release URLs.

## Milestone 6 — security hardening

1. Add explicit web security headers (CSP, nosniff, frame-ancestors/X-Frame-Options where applicable, referrer policy, HSTS at deployment layer).
2. Add auth/authorization tests for missing/invalid/expired bearer tokens.
3. Add image magic-byte/decoder validation server-side instead of trusting filename/MIME alone.
4. Add secret-pattern scan for built Android/web artifacts; service-role must never appear client-side.
5. Expand `admin_audit` coverage to every destructive/mutating owner action.
6. Review `QUERY_ALL_PACKAGES`; narrow it if update discovery can work via known catalog package queries without breaking side-loaded usage.
7. Enable Supabase leaked-password protection if available for the project plan; otherwise document the platform limitation.

## Milestone 7 — compatibility matrix

1. Add CI emulator tests where feasible for API 29, 30, 31, 33, 34, 35/36 and small/large screen profiles.
2. Check portrait/landscape clipping, especially detail chips/sheets/shelves.
3. Validate no Play Services dependency.
4. Add downloaded-APK ABI compatibility warnings using inspection ABI metadata.
5. Exercise Wi-Fi/mobile/no-network states with DownloadManager behavior; document any manual-only cases.

## Milestone 8 — APK STORE self-update

1. Add separate `self_update` (or equivalent) single-channel metadata with versionCode/name/changelog/size/SHA/cert/storage key.
2. Add public-safe self-update metadata/download endpoint.
3. Add About → Check for update; reuse existing downloader, SHA/package/signer validation and PackageInstaller.
4. Extend WorkManager to notify about store-self updates; Settings toggle defaults on per requested behavior.
5. Add CI/release documentation so owner publishes a store update without using the third-party app admin UI.

## Milestone 9 — crash/non-fatal monitoring

1. Add Supabase-backed public-safe `crash_reports`/`error_reports` ingest with strict size/rate limits and no service key in Android.
2. Android queues scrubbed crash/non-fatal events offline and retries later; include device model, Android/app version, action/screen, stack/error but no user content/PII.
3. Add owner-only Diagnostics admin screen with search/filter.
4. Add structured backend error events for admin/Edge failures.
5. Verify reporter failure can never crash the app.

## Verification gates for every milestone

- No completion claim without a fresh relevant test/build/log check.
- Android behavior changes: `:app:testDebugUnitTest :app:assembleDebug :app:assembleRelease` must pass.
- Web changes: unit tests + typecheck + build; Playwright where the scenario is supported.
- DB migrations: run Supabase security/performance advisors afterward.
- Edge deployments: inspect function logs for new 4xx/5xx regressions.
- Before merge: review the complete diff against the audit requirements; no unrelated redesign.