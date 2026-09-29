# APK STORE full-system audit repair implementation plan

> Execute this plan on `audit/full-system-20260929`. Preserve the current UI/UX and existing data. Use test-first changes for behavior fixes; generated launcher assets/configuration are treated as asset/config work and verified by the Android build/package output.

## Baseline

- Repository baseline: `d64c022eca33e2690bc305061b8ededc9de5302b`.
- Live Supabase project: `qfbfxencwsgryoczkdyj`.
- Pre-change findings: `docs/audits/2026-09-29-full-system-prechange-audit.md`.
- Supplied launcher source: `apk_store_launcher_icon.png` from the owner conversation.

## Task 1 — Regression-test backend icon publication invariant

Files:
- Add `supabase/functions/admin-upload/icon-policy.mjs`
- Add `supabase/functions/admin-upload/icon-policy.test.mjs`
- Edit `supabase/functions/admin-upload/index.ts`

Steps:
1. Add failing tests that a publishable inspection requires a non-empty HTTPS icon URL and that missing/unsupported extraction is rejected with a useful reason.
2. Run Node tests and confirm RED.
3. Implement the smallest shared icon policy helper.
4. Make APK inspection fail instead of silently succeeding when no supported icon can be extracted/uploaded.
5. Make publish reject an inspected candidate that lacks a valid icon URL.
6. Run helper/function tests and confirm GREEN.

## Task 2 — Make the 300 MB/R2 upload path canonical for the admin web app

Files:
- Edit `apps/web/lib/apk/inspection.ts` or remove the obsolete 50 MB constraint from the active flow.
- Add `apps/web/lib/admin/edge-upload.ts`.
- Edit `apps/web/app/api/admin/uploads/route.ts`.
- Edit `apps/web/app/api/admin/uploads/[id]/complete/route.ts`.
- Edit `apps/web/components/upload-form.tsx`.
- Add/update `apps/web/tests/*.test.ts`.

Steps:
1. Add a failing unit test for 300 MB acceptance and >300 MB rejection in the canonical request contract.
2. Add a server-side proxy helper that forwards the owner's Bearer token to `admin-upload?action=start|complete|inspect|cancel`; do not expose service-role or R2 credentials to browser JavaScript.
3. Start uses the Edge Function so >50 MB receives an R2 signed URL.
4. Complete calls Edge `complete`, then automatically calls Edge `inspect` and returns the inspection result/error.
5. Expose real XHR cancellation in the UI; abort the PUT and invoke the server cancel action.
6. Change user-facing limit to 300 MB.
7. Run unit/type/build tests.

## Task 3 — Repair broken catalog icons and add validation/backfill support

Files:
- Edit `supabase/functions/app-icon/*` only if behavior needs code changes.
- Add a safe audit/backfill helper/action if needed.
- Update live `apps.icon_source_url`/`icon_url` only for verified broken/fragile rows.

Steps:
1. Reproduce `urlcheck` 502 from live logs/source.
2. Find a durable trusted icon source (F-Droid or matching GitHub repository/tag) and verify HTTP image response before updating data.
3. For older rows still pointing to the prior hosted website, migrate to trusted source metadata or upload durable icons to `app-icons` where verified.
4. Re-request every published icon and record any remaining non-200/non-image response.
5. Do not delete apps/releases/files during backfill.

## Task 4 — Generate and wire supplied launcher branding

Files:
- Add `apps/android/app/src/main/res/mipmap-mdpi/ic_launcher.png` (48x48)
- Add `mipmap-hdpi/ic_launcher.png` (72x72)
- Add `mipmap-xhdpi/ic_launcher.png` (96x96)
- Add `mipmap-xxhdpi/ic_launcher.png` (144x144)
- Add `mipmap-xxxhdpi/ic_launcher.png` (192x192)
- Add matching `ic_launcher_round.png` density assets if the crop benefits from a separate round form.
- Replace adaptive foreground/background/monochrome resources used by `mipmap-anydpi-v26/ic_launcher.xml`.
- Edit `AndroidManifest.xml` if round icon must point to a separate resource.
- Add admin/web branding asset and favicon/app icon under `apps/web/app` / `public` using Next.js 16 App Router conventions.

Steps:
1. Inspect the 1254x1254 source image.
2. Generate legacy square launcher assets from the full artwork.
3. Derive a transparent foreground from the central APK STORE badge/wordmark with Android adaptive safe-zone padding; use the dark navy as adaptive background.
4. Generate a one-color alpha silhouette for Android 13+ themed icons.
5. Wire and verify manifest references.
6. Verify generated dimensions and packaged Android resources in CI/build artifact.

## Task 5 — Non-destructive security/performance hardening

Files:
- Add a Supabase migration for covering indexes identified by the advisor.
- Add/verify Next.js 16 security headers (`CSP`, `X-Content-Type-Options`, `frame-ancestors`/`X-Frame-Options`, referrer policy) in `next.config.*` using official Next 16 header configuration.
- Keep service-role/R2 secrets server-side.

Steps:
1. Add migration tests/inspection for indexes; migration must not delete or rewrite user data.
2. Verify public role grants remain read-only after migration.
3. Build frontend and inspect source/config for service-role/R2 secret exposure.
4. Record leaked-password protection as a manual/connector setting if not safely changeable in code.

## Task 6 — Android/web/backend regression verification

Commands / CI equivalents:
- Android: `gradle --no-daemon :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease`
- Web: `npm run test:unit`, `npm run typecheck`, `npm run build`; browser tests if deployment/runtime is available.
- Edge helpers: `node --test supabase/functions/**/*.test.mjs` (or targeted files supported by Node glob handling).

Checks:
1. No test/build success claim without fresh command/CI evidence.
2. Inspect produced APK resources/manifest and ABI contents.
3. Re-run live RLS/grant/storage/advisor queries after any database migration.
4. Re-run live icon requests/log checks.
5. Do not claim device/emulator-only interactions were tested unless an actual device/emulator run was performed.

## Task 7 — Final audit report and delivery

Files:
- Update `docs/audits/2026-09-29-full-system-prechange-audit.md` into a final evidence-backed status report or add `docs/audits/2026-09-29-full-system-final-audit.md`.

Report:
- Part A–F table: item, final status, root cause/risk, fix applied, exact phone/admin verification steps.
- Generated launcher asset paths/densities, adaptive/monochrome wiring.
- Live data rows backfilled and unresolved exceptions.
- CI run IDs/artifacts and any runtime checks not possible in this environment.
- Keep the stale expired CapCut upload and trashed APK STORE catalog row unchanged unless the owner separately confirms cleanup/restore.
