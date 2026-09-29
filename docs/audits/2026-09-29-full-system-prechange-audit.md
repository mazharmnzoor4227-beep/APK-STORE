# APK STORE — pre-change full-system audit

Date: 2026-09-29
Branch: `audit/full-system-20260929`
Baseline: `d64c022eca33e2690bc305061b8ededc9de5302b`

This report is intentionally written **before implementation changes**. It records findings verified from the repository and the connected live Supabase project. Items that require a real Android emulator/device, production website browser session, or destructive cleanup are explicitly marked `Needs runtime verification` / `Needs owner confirmation` rather than guessed.

## Executive findings

| Area | Status | Pre-change finding | Planned fix / verification |
|---|---|---|---|
| Android launcher icon | Broken | Manifest references `@mipmap/ic_launcher`, but the repository has only an API-26 adaptive icon resource and no legacy `mipmap-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi` launcher PNG set. Existing adaptive foreground is a generic green play tile, not the supplied APK STORE artwork. | Generate legacy density assets, a safe-zone adaptive foreground, dark-blue background and monochrome themed layer from the supplied `apk_store_launcher_icon.png`; wire round icon separately where useful; build APK and inspect packaged resources. |
| Published app icons | Partially broken | Live catalog has no published rows with a NULL `icon_url`, but several rows depend on a proxy or an old hosted image. Live Edge logs show `app-icon?slug=urlcheck` repeatedly returning HTTP 502 while many other proxied icons return 200. | Repair broken source metadata and add durable icon validation/backfill. Avoid publishing entries whose icon cannot actually be read. |
| APK inspection → icon extraction | Broken / unsafe-to-publish | `admin-upload` accepts a successful APK inspection even if `parsed.iconBlob` is absent, unsupported, too large, or its storage upload fails. `publish` only copies `iconUrl` when present, so an inspected APK can still be published without a real extracted icon. | Make icon extraction/storage a required inspection result (or explicit manual replacement before publish), surface a specific inspection error, and add regression tests. |
| Admin large APK upload | Broken in current web flow | Live `admin-upload` Edge Function supports up to 300 MB and R2 above 50 MB, but the Next.js admin route still hard-limits uploads to 50 MB and always uses Supabase Storage. The UI also tells the owner the limit is 50 MB. | Route admin uploads through the 300 MB/R2 path, preserve real progress, add cancellation, and auto-run inspection after upload. |
| Upload cancellation | Partially works | Edge Function has a `cancel` action, but the current web `XMLHttpRequest` is not exposed to a Cancel button/abort controller. | Wire real XHR abort + server-side cancel action and test state cleanup. |
| Database integrity | Mostly OK | Live DB has 29 apps and 29 releases; no orphan release, no published app without release, no broken `current_release_id`, and no published app with blank `icon_url`. One expired upload candidate remains stuck in `uploading`. | Do not delete the stale row without owner confirmation. Add a safe stale-job cleanup path/status transition. |
| Public RLS / grants | Safe in verified catalog scope | RLS is enabled on all public tables. `anon`/`authenticated` have only SELECT on `apps`, `categories`, `media`, `releases`; policies restrict apps/releases/media to published/current content. No public write grants were found. | Keep read-only catalog model. Re-test after migrations. |
| Admin-only tables | Safe by grants, incomplete policy model | `admin_audit`, `candidate_events`, `review_events`, `upload_candidates` have RLS enabled but no policies. They currently have no anon/auth table grants, so direct public access is blocked. Supabase advisor flags this as informational. | Prefer explicit owner-only policies if browser-side direct access is ever needed; otherwise retain server/service-role-only access and document it. |
| Auth password protection | Needs hardening | Supabase security advisor reports leaked-password protection disabled. | Enable in Auth settings if available; document manual step if connector/API cannot change this safely. |
| Storage | Mixed / expected | `apk-files` is private; `app-icons` and `app-screenshots` are public read buckets. Current limits are 50 MB for Supabase APK storage, 1 MB icons and 300 KB screenshots. Large APKs rely on R2 in the Edge flow. | Verify no public write/delete path exists, validate object existence and response content, and keep draft APKs private. |
| APK integrity/install | Implemented, runtime test pending | Android code verifies exact byte size, SHA-256, package ID, release signer, installed signer, and uses `PackageInstaller` sessions. | Build/unit-test and perform install/update runtime test where tooling permits. |
| Offline catalog | Implemented, runtime test pending | `CatalogRepository` persists `catalog.json`, loads cached data and paginates REST results 100 rows at a time. | Test cold/offline and cached/offline behavior; ensure clear retry state on fresh install. |
| Android security manifest | Mostly safe | `usesCleartextTraffic=false`, `allowBackup=false`; install-result receiver is not exported. `QUERY_ALL_PACKAGES` remains broad. | Review whether targeted `<queries>` can replace broad package visibility without breaking update discovery. |
| Device compatibility | Configuration OK, matrix pending | `minSdk=26` (older than the requested Android 10/API 29 floor), `targetSdk=35`. | Build on current SDK; emulator/device matrix for API 29+ remains runtime verification. |
| Performance | Needs indexes | Supabase advisor reports four unindexed foreign keys: app current-release relation, candidate event candidate ID, review event release ID, upload candidate target app ID. | Add non-destructive covering indexes after verifying query patterns. |

## Part A — database/backend

| Item | Status | Root cause / risk | Pre-change evidence / action |
|---|---|---|---|
| Schema | Works with naming differences | Canonical columns are `package_id`, `apk_sha256`, `byte_size`, `visibility`, etc.; no need to duplicate them as `package_name`, `sha256`, `size_bytes`. | Live schema inspected table-by-table. |
| Icon storage | Partially works | Four uploaded icons exist in `app-icons`; many catalog icons currently proxy trusted upstream sources; seven older entries still point at the previous hosted site. | Validate every reachable URL and migrate fragile entries to durable storage/proxy metadata. |
| APK icon extraction | Broken | Inspection does not fail when icon extraction/upload fails. | Regression test first; then enforce icon invariant. |
| Icon backfill | Missing as a complete operation | No one-shot verified backfill that checks actual HTTP content for every published app and repairs failures. | Add safe backfill/admin action; report unresolved entries. |
| Screenshots | Partially populated | Screenshot arrays exist for many apps; several apps have zero screenshots. Bucket is public-read WebP with 300 KB limit. | Validate URLs/order and distinguish optional absence from broken references. |
| APK storage | Partially verified | Supabase APK bucket is private/50 MB; Edge Function uses R2 for large APKs. Current Next admin flow does not use R2. | Verify each current release object/URL and unify upload flow. |
| RLS/grants | Works for public catalog | No public writes found. | Re-run after fixes. |
| Edge functions | Partially works | `download-apk`, `store`, `admin-upload`, `app-icon` are active. `app-icon` has a reproduced 502 for URLCheck. | Audit each function input/auth/error path and fix tested failures. |
| Data integrity | Mostly works | No release/app or current-release orphans; one expired `uploading` candidate exists. | Cleanup requires owner confirmation before deleting data. |
| Version compare data | Works at DB type level | `releases.version_code` is BIGINT, not text. | Verify Android compare logic with tests. |

## Part B — Android app

| Item | Status | Root cause / risk | Planned verification |
|---|---|---|---|
| Own launcher icon | Broken | Missing legacy density resources; adaptive foreground does not match supplied branding. | Resource/package inspection + install/emulator where available. |
| Listed-app icon loader | Partially works | Backend proxy mostly returns 200, but at least URLCheck returns 502. | Fix backend source and test fallback/cache behavior. |
| Install/update integrity | Implemented | `ApkIntegrity` and `InstallCoordinator` perform the expected checks/session flow. | Unit/build + real install test. |
| Download history | Implemented in code | SharedPreferences records status/error/progress; behavior still requires device runtime verification. | Runtime test failed/cancelled/installed states. |
| Cached catalog | Implemented | Atomic file cache and REST pagination exist. | Offline test. |
| WorkManager updates | Implemented in code | Periodic work is scheduled from the configured interval. | Runtime scheduling/notification test. |
| Remaining UI interactions | Needs runtime verification | Source review alone cannot prove every click target, scroll state, full-screen image gesture or OEM installer behavior. | Exercise the prompt's itemized phone test matrix after build. |

## Part C — admin panel

| Item | Status | Root cause / risk | Planned fix / verification |
|---|---|---|---|
| Owner auth | Partially verified | Edge function independently validates JWT + confirmed exact owner email. Next routes also require owner auth; full browser session test pending. | Browser/API unauthorized tests. |
| Upload >100 MB | Broken | Current Next route/library has a hard 50 MB limit while Edge/R2 supports 300 MB. | Switch route to R2-capable Edge flow; test >100 MB contract. |
| Upload progress | Works in code | XHR progress uses `loaded/total`. | Browser runtime. |
| Cancel | Broken in UI | No exposed abort/cancel control despite backend cancel support. | Add and test. |
| Auto-inspection | Partially works / split implementation | Next route dispatches legacy inspection; Edge has a different inspection implementation. The two flows are inconsistent. | Use one canonical inspection flow and trigger it automatically after completion. |
| Extracted icon | Broken invariant | Missing icon does not fail inspection/publish. | Enforce invariant, manual replacement fallback, Reset-to-APK-icon behavior. |
| Review/publish | Partially works | Core approve/reject exists, but icon reset/crop and full queue lifecycle are incomplete relative to spec. | Implement only functionality gaps, no redesign. |
| Apps/trash/settings | Partially implemented | Trash lifecycle and management code exists; all actions still need real backend/browser verification. | Verify endpoint + UI outcome, including storage cleanup only with safe test data. |

## Part D — cross-system

Status: **Needs runtime verification after fixes.** Publish/unpublish/update/icon-refresh must be tested as end-to-end transactions across admin → DB/storage → Android cache/UI. No success is assumed from code inspection alone.

## Part E — security

| Item | Status | Risk / finding | Planned action |
|---|---|---|---|
| Cleartext / backup | Safe in manifest | Both disabled. | Keep. |
| Exported components | Mostly safe | MainActivity exported for launcher; receiver private. | Review any components added later. |
| Public key in APK | Expected | Publishable Supabase key is embedded; safety depends on RLS/grants. | RLS live audit currently supports this model. |
| APK hash/signing | Safe in code | Hash/package/release signer/installed signer checks exist. | Runtime test. |
| Admin authorization | Strong in Edge path | Owner JWT/email is checked server-side before actions. | Test unauthenticated/expired token responses. |
| File upload validation | Needs improvement | Size/name and bucket MIME constraints exist, but canonical web flow is split; inspection must reject missing icon and invalid APK result. | Consolidate and test. |
| Secrets | Needs bundle/env audit | No conclusion until built frontend and config are inspected. | Grep build/source and ensure service-role/R2 secrets remain server-only. |
| Leaked password protection | Vulnerable configuration | Disabled per Supabase advisor. | Enable/manual remediation. |
| Public icon proxy | Partially safe | Trusted-host allowlist, HTTPS, MIME and size checks exist; one upstream URL is broken. | Repair data, retain SSRF-safe allowlist. |
| Rate limiting | Unknown-needs-testing | No verified application-level rate limit yet. | Inspect/deploy bounded behavior where appropriate. |

## Part F — compatibility

| Item | Status | Finding |
|---|---|---|
| minSdk/targetSdk | OK configuration | minSdk 26 supports Android 10+; targetSdk 35. |
| Screen sizes/OEMs | Needs runtime verification | Cannot be proven from source alone. |
| ABI | Needs APK inspection | Java-only store app may be universal unless dependencies add native code; inspect built APK. |
| Permissions by OS version | Needs runtime verification | REQUEST_INSTALL_PACKAGES and notification/storage behavior must be exercised across API levels. |
| Wi-Fi/mobile data | No Wi-Fi-only restriction found in reviewed repository paths so far | Verify DownloadManager request and network-switch behavior on device. |
| Offline/poor network | Cache exists | Fresh-install no-cache error state still needs runtime test. |

## Destructive or owner-sensitive findings intentionally not changed yet

1. One expired 291,774,003-byte CapCut upload candidate is still `uploading`. It will not be deleted without owner confirmation.
2. The `apk-store` catalog row is currently unlisted and in Trash with a release attached. It will not be restored or purged implicitly; launcher branding is a separate Android build concern.
3. No existing app/release rows or storage objects will be deleted during repair unless a test explicitly uses disposable data or the owner confirms the deletion.

## Fix order

1. Regression tests for icon publication invariant and large-upload contract.
2. Fix critical backend/admin functional split and icon extraction/publish gating.
3. Repair/backfill broken catalog icons without deleting app data.
4. Generate and wire the supplied APK STORE launcher/adaptive/monochrome assets and admin favicon/branding.
5. Security/performance hardening that is non-destructive (indexes, verified auth/RLS behavior, headers/config).
6. Build/test Android and web; run end-to-end checks that tooling supports.
7. Final audit report updates every item with actual verification evidence and explicitly lists any remaining device-only checks.
