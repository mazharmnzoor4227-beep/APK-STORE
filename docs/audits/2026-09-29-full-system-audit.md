# APK STORE full system audit — 2026-09-29

Baseline audited: `main` at `1f5dc4e1ccf8bf4e11e054e4d1c564e0bdf3b122` (Android 1.1.5 / versionCode 13). The audit documentation commit itself does not change runtime behavior.

`Works/Safe` means supported by source plus DB/storage/log/build evidence. `Broken/Vulnerable` means a concrete defect was reproduced in code/data/logs. `Partial` means only part of the requested behavior exists. `Unknown — device test required` means repository/backend evidence cannot prove real-device behavior.

## Executive findings

1. **Catalog icons are not fully fixed.** Android now accepts HTTPS icon URLs, but production logs show repeated `GET /functions/v1/app-icon?...slug=urlcheck` → HTTP 502. Its configured raw GitHub icon path is also 404.
2. **APK inspection is failing in production.** `admin-upload?action=inspect` repeatedly returns HTTP 546 `WORKER_RESOURCE_LIMIT`. Heavy APK parsing/hashing inside the Edge Function is the root architectural problem.
3. **Two competing admin upload stacks exist.** The Next admin path caps uploads at 50 MiB and dispatches GitHub Actions; the live Supabase Edge admin supports R2 up to 300 MiB. Their fields/behavior do not match.
4. **The Next/GitHub inspector does not extract icon, SDK, permissions or ABI.** It only returns package/version/certificate/hash/size, so the UI asks for a manual icon.
5. **Android screenshot rendering rejects most catalog screenshots.** DB rows contain F-Droid/raw.githubusercontent screenshot URLs but `trustedImage()` accepts only Supabase public buckets and the legacy site host.
6. **The Android-version chip is confirmed broken.** Detail UI renders `Android <min_sdk>+` directly, so API 23 becomes “Android 23+” instead of Android 6.0+.
7. **Admin UI is incomplete versus the requested workflow.** Login is OTP magic link instead of password; upload lacks drag/drop/cancel; queue/trash/search/sort/copy/open-store/delete/screenshot-management flows are absent or not wired in the Next UI.
8. **Core APK install integrity is strong.** Android verifies file size, SHA-256, package ID, release signer and installed signer before `PackageInstaller` install.
9. **Database integrity is mostly good.** 0 orphan releases; 0 published apps without a current release; 0 bad current-release links; 0 published apps pointing at non-published releases. One expired `uploading` candidate remains stale.
10. **Self-update and crash reporting are missing.** No dedicated self-update release channel/flow and no Sentry/self-hosted crash pipeline exists.

## Part A — database/backend

| Item | Status | Evidence / root cause | Fix required | Verify |
|---|---|---|---|---|
| A1 schema | Partial | Public tables are `apps`, `releases`, `categories`, `media`, `upload_candidates`, `candidate_events`, `review_events`, `admin_audit`. Core release hash/size/version/cert fields are populated for all 29 published releases. 4 published apps have empty `short_description`; 10 published apps have no screenshots. | Normalize fields needed by real features; keep local-only favourites/history local rather than inventing redundant DB tables. | SQL integrity query + store UI. |
| A2 icon bucket/URLs | Broken | `app-icons` is public-read, 1 MiB limit; 4 stored icon objects are non-zero images. 17 published apps use `app-icon` proxy, 7 legacy host. `urlcheck` proxy is repeatedly 502 and its configured raw GitHub path is 404. | Backfill durable icons into `app-icons`; fail publication when no real icon is available unless owner explicitly overrides. | Every published `icon_url` resolves to a non-zero image; no 502 icon logs. |
| A2 APK icon extraction | Broken / split | Live Edge parser attempts `iconBlob` but inspection hits resource limits. GitHub Actions inspector does not extract icon/SDK/permissions/ABI. | Make GitHub runner the canonical heavy inspector; upload extracted icon and metadata. | New APK auto-inspects with icon + SDK + permissions + ABI. |
| A2 backfill | Missing | No durable one-shot repair for proxy/legacy icon URLs. | Add idempotent backfill action/script and unresolved-app report. | All published icon refs verified. |
| A3 screenshots | Partial | Supabase screenshot objects exist, valid WebP and under 300 KiB; catalog also contains many external F-Droid/GitHub screenshot URLs. | Import external screenshots or support a strict trusted-source path consistently. | Detail carousel shows configured screenshots. |
| A4 APK storage | Partial / mostly OK | Two current Supabase-hosted releases were checked: object exists and DB byte size matches exactly. R2 current releases exist for BLACK HOLE/MovieBox but current connector cannot inventory R2 directly. | Add automated Supabase/R2/external Head integrity job. | 0 missing/size mismatch. |
| A5 RLS | Safe | `apps`/`releases`/`media` public policies expose only published data; no anon write policies. Admin/private tables are RLS-protected. Service-role stays server-side. | Add regression tests for anon writes. | anon read limited; writes rejected. |
| A6 Edge/API | Broken/Partial | `download-apk` validates input/trusted URLs. `app-icon` has real 502s. `admin-upload` is owner-authenticated but inspection exceeds worker resources. Live `store` Edge function is a 503 placeholder. | Fix icon durability, move heavy inspection off Edge, retire/document unused `store`, add rate limiting. | Function tests + live logs. |
| A7 integrity | Partial | No orphan/current-release corruption; one expired `uploading` candidate. | Add safe stale-job cleanup policy; do not delete real app/release data silently. | stale count 0. |
| A8 version compare | Works | Android uses integer/long `version_code` and `published > installed`. | Preserve and test. | Unit tests. |

## Part B — Android store app

| Item | Status | Evidence / root cause | Fix required | Verify |
|---|---|---|---|---|
| B1 launcher icon | Implemented; device verification pending | Manifest points `icon`/`roundIcon` to `@mipmap/ic_launcher`; mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi PNGs plus adaptive foreground/monochrome exist. CI build passed. | Compare to exact supplied source PNG when available; run controlled device/emulator checks. | Home, recents, installer on API 29 + current. |
| B3–6 listed-app icons | Partial | Shared loader accepts HTTPS and caches, but a live backend icon URL still 502s. | Durable backend icons + telemetry/fallback. | Home/Search/Detail/Updates all show real icon. |
| B5a Android version chip | Broken | `detailChip(..., "Android " + minSdk + "+")` displays raw API level. | API→Android-version mapping + tests. | API 23 = Android 6.0+, 26 = 8.0+, 35 = 15+. |
| B8 bottom nav | Partial | Tabs switch correctly; separate scroll position preservation is not implemented. | Persist/restore tab scroll positions. | Manual scroll/tab test. |
| B9 View all | Works in source | Home section headings route to matching listing source. | Preserve. | Tap each section. |
| B10 filters | Works in source | Category/price choice sheets show selected check and apply only on choice. | Device UI check. | Cancel keeps prior filter. |
| B11 search | Mostly works | 250 ms local filtering; recent searches persisted; Clear removes them. | Preserve. | Search/restart. |
| B12 install/update/open/uninstall | Mostly works | DownloadManager→app-specific external storage; hash/size/package/cert validation; PackageInstaller; Open/Uninstall states. | Tighten cancel/file cleanup and batch update behavior. | Real install/update/cancel. |
| B13 favourites | Works locally | Persisted in preferences and reflected in Favorites. | Preserve. | Restart test. |
| B14 Share | Broken/weak | Shares store root + title, not app-specific link. | Canonical detail URL/deep link. | Shared link opens exact app. |
| B15 overflow | Partial | Blacklist/ignore persist; GitHub only opens if `source_url` is GitHub, otherwise silent. | Explicit unavailable state + valid source handling. | Test all actions. |
| B16 expandable rows | Works/Partial data | Expand/collapse works; empty content becomes `No information supplied`. | Populate real inspector metadata. | Detail check. |
| B17 screenshots | Broken for external refs | `trustedImage()` rejects F-Droid/raw GitHub URLs that are stored in DB. | Import or strict whitelist/proxy. | All configured images render + viewer works. |
| B18 source/F-Droid links | Works when present | HTTPS links open browser. | Backend validation. | Tap examples. |
| B19 Updates / Update all | Partial | Badge derives from real pending updates. `Update all` starts every download immediately, not sequentially, and has no batch failure report. | Sequential queue + per-app result. | Multi-update test. |
| B20 Downloads history | Mostly works | Records Downloading/Downloaded/Installed/Failed/Cancelled + error. | Retain exact title in all transitions. | Failure/cancel check. |
| B21 menu | Partial | My apps/Favourites/Blacklist/Ignored/Settings/About exist. Donate currently points to repo. | Confirm actual Donate target if desired. | Manual menu test. |
| B22 Settings | Partial | Theme, 6/12h WorkManager schedule, cache clear exist. | Add only requested backed settings; Shizuku only if actually used. | Restart/schedule test. |
| B23 offline | Mostly works | Catalog cache exists; no-cache network failure gives Retry. | Add stale-cache indication if useful. | Airplane-mode test. |
| B24 background update | Partial | Worker calculates/stores count but creates no notification. | Notification channel/permission + toggle. | Worker test. |

## Part C — admin panel

| Item | Status | Evidence / root cause | Fix required | Verify |
|---|---|---|---|---|
| C25 login | Broken vs requirement | Next UI uses `signInWithOtp`, not email+password. Server APIs independently verify bearer user + confirmed exact owner email. | Password sign-in + sign-out/session persistence while preserving server-side owner auth. | Correct/wrong password + signed-out API test. |
| C26 upload | Broken/fragmented | Next UI is file-picker only, no drag/drop/cancel, backend hard-caps 50 MiB. Live Edge backend separately supports R2 to 300 MiB. | One canonical 300 MiB flow with drag/drop, abort, R2 >50 MiB. | 100–300 MiB upload + cancel/retry. |
| C27 auto-inspection | Broken | Next GitHub workflow extracts only package/version/cert/hash/size. Live Edge extracts more but repeatedly dies with worker limit 546. | Canonical GitHub runner extraction for icon/SDKs/permissions/ABI. | Upload auto-advances with full metadata. |
| C28 review/publish | Partial | Basic approve/reject/manual icon. No screenshot reorder/reset-to-APK-icon/save-draft in Next UI. | Complete owner review form. | Publish and refresh store. |
| C29 apps list | Partial | Basic list/edit/icon/visibility. No search/filter/sort/copy/open/delete/new-version workflow UI. | Add real management controls. | Exercise each button. |
| C30 trash | Missing in Next UI | Live Edge has delete/restore/purge routes but current Next admin does not expose them. | Trash UI + permanent delete confirmation + storage verification. | Delete→Trash→restore/purge. |
| C31 queue | Missing/minimal | Review panel shows candidates and manual retry only. | Filters/history/retry/cancel/reinspect/discard. | State transition test. |
| C32 settings | Missing | No admin settings screen for real catalog refresh/password/preferences. | Add only backed actions. | Change password/re-login; catalog refresh. |
| C33 all buttons | Partial | Existing shown actions are backed; many requested controls do not exist. | Implement or deliberately omit unsupported actions—no decorative controls. | E2E. |

## Part D — cross-system

| Item | Status | Evidence / root cause | Fix required |
|---|---|---|---|
| D34 publish→store | Partial | Published rows are visible through public catalog; icon extraction is inconsistent. | Controlled E2E after inspector fix. |
| D35 unpublish/delete | Partial | RLS/catalog hides unpublished rows; an already-open detail screen has no explicit “no longer available” refresh state. | Add explicit unavailable handling. |
| D36 new version→Updates | Core logic works | Integer versionCode comparison is correct. | E2E old→new update test. |
| D37 replace icon→all surfaces | Partial | Shared loader propagates a new URL; reusing the same URL can leave disk cache stale. | Immutable/versioned icon URLs + cache invalidation. |

## Part E — security

| Item | Status | Risk / evidence | Fix required |
|---|---|---|---|
| E38 manifest | Mostly safe | `allowBackup=false`, `usesCleartextTraffic=false`, receiver non-exported. `QUERY_ALL_PACKAGES` is broad. | Narrow visibility if functionality permits; otherwise document sideload rationale. |
| E39 TLS | Safe in inspected code | HTTPS used; no permissive TrustManager/HostnameVerifier found. | Preserve. |
| E40 secrets | Mostly safe | Android includes only publishable Supabase key. Service-role is server-side/Edge env. | CI secret scan. |
| E41 APK/update integrity | Safe | Size + SHA-256 + package + release signer + installed signer checked before install. | Preserve/tests. |
| E42 installer | Safe/modern | PackageInstaller session + app-specific external file. | API matrix. |
| E43 WebView | Safe/not used | No WebView found; Markdown uses Markwon. | Preserve. |
| E44 local storage | Acceptable | No Android credentials stored; settings/history only; APK app-specific. | Remove APK on every final install outcome where appropriate. |
| E47 transport/headers | Unknown/Partial | Production chat-host domain was not accessible to current web probe; no repository CSP/HSTS config found. | Explicit security headers + live verification. |
| E48 auth | Partial | Supabase handles password storage; current UI OTP. Supabase advisor reports leaked-password protection disabled. | Password login + enable protection if account plan permits + rate limiting. |
| E49 authorization | Safe in inspected endpoints | `requireOwner()` validates bearer token and exact confirmed admin email; Edge admin-upload does the same. | 401/403 integration tests. |
| E50 injection/XSS | Mostly safe | Supabase query builder/server validation; React escapes normal strings. | Malicious-input tests. |
| E51 CSRF | Low exposure | State-changing Next APIs require Authorization bearer header rather than ambient cookie-only auth. | Preserve same-origin discipline. |
| E52 uploads | Partial | APK signer/hash validation exists. Image flows mostly trust declared MIME/storage metadata. | Decode/validate actual image bytes server-side. |
| E53 service-role | Safe in inspected code | Server/Edge only. | Built-bundle scan. |
| E54 config/security headers | Partial | `.env*` ignored; no CSP/HSTS repo config found. | Add headers/deployment tests. |
| E55 audit logging | Partial | `admin_audit` exists but currently only 2 rows; not every mutation logs. | Log publish/unpublish/delete/restore/purge/password-related owner events. |
| E56 RLS | Safe by policy inspection | Public reads constrained; no public writes. | Automated anon-policy tests. |
| E57 storage buckets | Mostly safe | APK bucket private; icons/screenshots public-read; no anon write policy found. | Regression tests. |
| E58 SSRF/open redirect | Safe in `download-apk` | Redirect limited to exact trusted GitHub/F-Droid/legacy-host forms. | Preserve. |
| E59 rate limiting | Missing | No application-level rate limit found on public Edge functions. | Add lightweight rate limits/gateway policy. |

## Part F — device/network compatibility

| Item | Status | Evidence / gap | Fix required |
|---|---|---|---|
| F60 SDK | Works | `minSdk 26`, `targetSdk 35`, so Android 8+ baseline covers Android 10+. | Keep version guards; update target with toolchain as appropriate. |
| F61 screens/densities | Partial | dp/sp used, but fixed-width shelf/card values exist. No controlled matrix yet. | API/size/orientation matrix and clipping fixes. |
| F62 OEM/Play Services | Likely safe | No Google Play Services dependency found. | OEM/manual checks. |
| F63 ABI | Store app safe | Pure Java store app has no native libs. Third-party APK ABI matching is not implemented. | Use inspector ABI metadata to warn/select compatible assets. |
| F64 permissions | Partial | Unknown-app install flow is handled. Notification runtime permission absent because background notification feature is absent. | Add POST_NOTIFICATIONS with update notifications. |
| F65 Wi-Fi/mobile | Mostly works | No Wi-Fi-only restriction; DownloadManager handles OS network changes. | Real Wi-Fi↔mobile test + paused/retry messaging. |
| F66 offline | Mostly works | Cached catalog + Retry on empty first launch. | Controlled no-cache airplane-mode test. |
| F67 device matrix | Not completed | CI builds/tests but no API 29→latest emulator suite was run here. | Add emulator matrix workflow/manual matrix report. |

## Part G — in-app self-update

| Item | Status | Gap | Fix required |
|---|---|---|---|
| G68 stable identity | Works | `applicationId = com.apkstore.client`; current versionCode 13. | Document invariant + monotonic release check. |
| G69 release channel | Missing | No dedicated store-client self-update record/feed. | Add separate Supabase self-update metadata + safe download path. |
| G70 About check | Missing | No “Check for update”. | Reuse download/integrity/PackageInstaller flow. |
| G71 background self-check | Missing | Current worker only counts catalog updates. | Add self-update notification/toggle. |
| G72 owner publish flow | Missing | No simple store-self release procedure. | CI/release script + docs. |

## Part H — crash/error monitoring

| Item | Status | Gap | Fix required |
|---|---|---|---|
| H73 crash reporting | Missing | No Sentry/self-hosted crash pipeline. | Prefer public-safe Supabase ingest + offline queue in this stack unless Sentry is chosen. |
| H74 non-fatal errors | Missing centrally | Errors are local only. | Report important download/install/API failures. |
| H75 diagnostics UI | Missing | No owner diagnostics screen/table. | Add owner-only diagnostics view. |
| H76 backend visibility | Partial | Supabase service logs exist; admin has no diagnostics UI. | Structured error logging + summary. |
| H77 secret safety | N/A until added | No reporter exists. | Ingest must never expose service-role key. |

## Verified production snapshot

- Apps: 29 total, 28 published.
- Releases: 29; all 29 have non-empty valid versionCode/versionName/byteSize/SHA-256/certificate fields.
- Published apps missing `icon_url`: 0, but a non-null URL is not proof of a working image.
- Published apps with empty short description: 4.
- Published apps with no screenshots: 10.
- `app-icons`: 4 stored image objects, non-zero.
- `app-screenshots`: 12 stored WebP objects, all under 300 KiB.
- Current Supabase APK objects checked: Lark Player and SuperVPN exist and exact sizes match DB.
- Current R2 refs: BLACK HOLE and MovieBox; direct R2 inventory still needs a HeadObject verification path.
- Integrity: 0 orphan releases; 0 published-without-release; 0 bad current-release relationships; 1 expired `uploading` candidate.

## Pre-audit 1.1.5 icon patch

The earlier patch added legacy launcher PNG densities, wired adaptive foreground artwork and monochrome, and changed the catalog icon loader from obsolete-host gating to HTTPS + byte/decode checks. CI `:app:testDebugUnitTest :app:assembleDebug :app:assembleRelease` passed before merge. This audit deliberately does **not** call the overall icon complaint complete because production backend evidence still proves an icon proxy failure.

## Device-test limitation

The current environment can inspect/modify GitHub, Supabase DB/functions/storage metadata, CI and production logs, but it has no Android emulator/physical-device control surface. Real-device status is therefore only marked verified where production logs provide concrete device requests. Launcher/recents rendering and the full UI interaction matrix remain explicit device-test items after each build.