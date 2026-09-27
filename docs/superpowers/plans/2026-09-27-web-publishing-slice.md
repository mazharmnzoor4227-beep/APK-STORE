# APK STORE Web Publishing Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a usable responsive public web store and private admin workflow that publishes a real signed APK only after owner approval.

**Architecture:** A Next.js TypeScript app serves public listings and owner-only administration. Supabase Auth, Postgres, and Storage keep the shared catalog and immutable files. A server-side inspection job extracts APK metadata and validates signing/version continuity before a transactional publish operation. The Android app and GitHub import consume this same data path in subsequent plans.

**Tech Stack:** Next.js/TypeScript, Supabase Auth/Postgres/Storage, SQL migrations, GitHub Actions for CI and APK inspection, Playwright for browser smoke checks, Android SDK `apkanalyzer` and `apksigner` in the inspection job.

**Spec:** `docs/superpowers/specs/2026-09-27-apk-store-design.md`

## Global Constraints

- Public clients read published records only; owner operations require server-verified identity.
- New APKs remain pending until the owner explicitly approves them.
- An update retains package ID and compatible signing certificate, and increases version code.
- APK download assets are immutable and identified by SHA-256; no temporary Actions artifact is a public download.
- The primary visual treatment is near-black with restrained green accents; Light, Dark, and System settings exist.
- Buttons never claim a completed operation before the server or Android confirms it.
- All credentials stay in server configuration, never in git or public clients.

## Review Focus

1. Malformed or renamed non-APK upload: inspection rejects it and no public listing changes (Task 3 test).
2. Existing package with a new signing certificate: approval rejects it and retains the current release (Task 4 test).
3. Two simultaneous approvals: publication keeps one valid current release and an audit trail (Task 4 test).
4. Anonymous access to a draft APK: storage and API both deny it (Task 2 test).
5. Expired or interrupted upload: admin shows retry and leaves no publishable partial candidate (Task 3 test).

## File map

- `apps/web/app/(store)/*`: public routes and settings.
- `apps/web/app/admin/*`: protected owner routes and review forms.
- `apps/web/components/*`: shared store components and design tokens.
- `apps/web/lib/catalog/*`: typed public and owner catalog queries.
- `apps/web/lib/apk/*`: upload and inspection request handling.
- `supabase/migrations/*`: relational schema, policies, and publish operation.
- `.github/workflows/*`: web CI and isolated APK inspection.
- `apps/web/tests/*`: API/flow tests and browser smoke checks.

## Task 1: Responsive design system and public shell

**Files:** Create `apps/web/package.json`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/components/header.tsx`, `apps/web/components/theme-control.tsx`, `apps/web/app/(store)/page.tsx`, `apps/web/tests/theme.spec.ts`; add root workspace/CI files as needed.

**Interfaces:** Produce `ThemeControl` with `light | dark | system` persisted locally and a responsive store shell consumed by later routes.

- [ ] Write a browser test asserting the theme choice persists on reload, System follows OS preference, and mobile search/navigation are reachable.
- [ ] Run the test and verify it fails against the empty repo.
- [ ] Build the black/green responsive shell, plus a usable light mode. Show an honest empty catalog state; do not embed sample apps or fake counters.
- [ ] Run browser and accessibility smoke checks at narrow and desktop widths; commit the passing slice.

## Task 2: Secured shared catalog

**Files:** Create `supabase/migrations/<generated>_catalog.sql`, `apps/web/lib/catalog/types.ts`, `apps/web/lib/catalog/public.ts`, `apps/web/lib/catalog/owner.ts`, `apps/web/tests/catalog.test.ts`.

**Interfaces:** `listPublishedApps(query, cursor)` returns paginated cards; `getPublishedApp(slug)` returns the current release and screenshots; owner queries return drafts and review candidates after authentication.

- [ ] Write database/API tests for published-only visibility, anonymous draft denial at both record and storage layers, owner authorization, package ID uniqueness, and stable pagination.
- [ ] Run tests and verify the visibility tests fail.
- [ ] Create tables for apps, releases, media, and review events; generate the migration with the Supabase CLI. Enable RLS and policies on exposed tables. Keep candidate APK objects private; grant public download only through a server-controlled published-release path.
- [ ] Run migration, policy tests, and Supabase security advisors; commit the passing schema and catalog queries.

## Task 3: Owner sign-in, APK upload, and inspection

**Files:** Create `apps/web/app/admin/login/page.tsx`, `apps/web/app/admin/apps/new/page.tsx`, `apps/web/app/api/admin/uploads/*`, `apps/web/lib/apk/inspection.ts`, `.github/workflows/inspect-apk.yml`, `apps/web/tests/upload.test.ts`.

**Interfaces:** `createCandidateUpload(owner, file)` returns a private upload target; `requestInspection(candidateId)` queues inspection; `recordInspection(candidateId, metadata)` saves authoritative package ID, version code/name, certificate SHA-256, APK SHA-256 and byte size. Inspection callback is authenticated server-to-server.

- [ ] Write tests for owner-only upload, malformed APK, oversized file, interrupted/expired upload, and untrusted inspection callback.
- [ ] Run tests and verify the initial failures.
- [ ] Implement direct-to-private-storage upload with progress and retry. Inspect the actual APK using Android SDK tools in an isolated job; validate checksum, package metadata and signer, then store immutable metadata. Never trust browser-supplied package ID or signature.
- [ ] Run tests and one signed APK fixture through inspection; commit the passing upload flow.

## Task 4: Approval and publication

**Files:** Create `apps/web/app/admin/page.tsx`, `apps/web/app/admin/apps/[id]/page.tsx`, `apps/web/app/admin/review/page.tsx`, `apps/web/lib/catalog/publish.ts`, a generated SQL migration for the atomic publish operation, and `apps/web/tests/publish.test.ts`.

**Interfaces:** `approveCandidate(owner, candidateId)` rechecks inspected metadata against the current release, atomically publishes the candidate, and records actor/time; `rejectCandidate(owner, candidateId, reason)` keeps it private.

- [ ] Write tests for first publication, matching higher version, wrong package ID, changed signer, same/lower version, and concurrent approvals. Assert failed cases preserve the old public release and create an audit event.
- [ ] Run tests and verify they fail.
- [ ] Build editor fields for listing title, description, category, icon, screenshots and release notes, with extracted package/version/signature fields read-only. Implement review, reject, and transaction-backed approval.
- [ ] Run tests and review the mobile admin flow; commit the passing publishing slice.

## Task 5: Real public discovery and download

**Files:** Create `apps/web/app/(store)/apps/[slug]/page.tsx`, `apps/web/app/(store)/search/page.tsx`, `apps/web/app/(store)/privacy/page.tsx`, `apps/web/app/(store)/support/page.tsx`, `apps/web/app/api/download/[releaseId]/route.ts`, `apps/web/components/app-card.tsx`, `apps/web/tests/store.spec.ts`.

**Interfaces:** Public pages use Task 2 queries. Download route returns a redirect or short-lived authorized URL only for the current published immutable APK; it never exposes private candidates.

- [ ] Write browser/API tests: approved app appears in home/search/detail; draft does not; detail displays actual icon/version/size/screenshots; download yields the approved APK checksum; missing asset shows a real error.
- [ ] Run tests and verify they fail.
- [ ] Implement responsive pages using Stitch hierarchy with the revised black/green system, real loading/empty/error states, privacy/support pages, and browser-native downloads.
- [ ] Test mobile and desktop, light and dark, and a complete signed test APK upload → inspection → approval → download; commit the passing slice.

## Task 6: Build and deployment readiness

**Files:** Create `.github/workflows/web-ci.yml`, `apps/web/.env.example`, root `README.md`; adjust prior files only for verified failures.

**Interfaces:** CI runs typecheck, unit/integration tests, and a production web build. Document required secrets and connected project setup without committing values.

- [ ] Add CI checks for typecheck, tests, and production build.
- [ ] Run typecheck, tests, production build and the end-to-end signed APK scenario; record results in README.
- [ ] Publish the web app only after the owner can review a working preview and the selected host/database/storage configuration is verified; commit the release-ready state.

## Follow-on plans after this tested slice

Create a separate GitHub import plan for selected repositories and release asset discovery, then a native Android plan for browse/download/system installation/library/updates. Both use the published catalog and APK validation established here. Each has its own tests and release gate; neither is represented as already implemented by this plan.
