# APK STORE Crash Reporting and Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture bounded first-party APK STORE crash diagnostics, upload them safely after restart, and show actionable crash status in the authenticated owner/admin panel.

**Architecture:** Store crash events locally during process failure, upload them only after the next launch to a strict Supabase Edge Function, aggregate by deterministic fingerprint in RLS-protected tables, and expose owner-only Next.js API/UI for triage. No Firebase/third-party analytics SDK is added.

**Tech Stack:** Android Java 17, app-private JSON queue, Supabase Postgres/RLS/Edge Functions, Next.js 16/React 19 admin panel, existing Supabase Auth owner gate.

**Spec:** `docs/superpowers/specs/2026-09-29-apk-store-self-update-crash-reporting-design.md`

## Global Constraints

- Crash capture must never replace/block Android's original uncaught-exception termination path.
- No network request is attempted from the crashing process.
- Only bounded technical diagnostics from the approved spec are collected.
- No contacts, files/media, clipboard, precise location, advertising IDs, account data, messages, or browsing history.
- Public/anon clients receive no direct SELECT access to crash tables.
- Admin state changes are owner-authenticated and audit logged.
- Current app/admin UI is preserved except small Crashes navigation/status additions.

## Review Focus

- Repeated crashes must not grow the on-device queue without bound.
- Malformed/oversized/hostile crash payloads must not reach unrestricted DB columns.
- Crash ingest abuse must be throttled/rate-limited enough to avoid trivial DB/storage cost amplification.
- Admin APIs must reject missing/invalid owner sessions even if UI routes are hidden.
- A failure uploading crash data must not delay or break normal app startup.

---

### Task 1: Crash schema, RLS, and aggregation RPC

**Files:**
- Create: `supabase/migrations/20260929_crash_reporting.sql`
- Create: `supabase/tests/crash_reporting.sql`

**Interfaces:**
- Produces tables `crash_issues`, `crash_events` and a service-role-only insert/upsert path that aggregates `event_count`, first/last seen, latest version, and status without granting public table reads.

- [ ] **Step 1: Write failing SQL tests** asserting anon cannot SELECT/INSERT/UPDATE crash tables, invalid statuses fail, event FK integrity works, and aggregate counter updates atomically.
- [ ] **Step 2: Run** repository Supabase SQL test workflow/tooling; expected FAIL before migration exists.
- [ ] **Step 3: Implement** migration with constraints, indexes on fingerprint/received time/status/version, RLS enabled, no anon policies, and service-role/RPC aggregation.
- [ ] **Step 4: Run** SQL tests; expected PASS.
- [ ] **Step 5: Commit** `feat: add protected crash reporting schema`.

### Task 2: Public-safe crash ingest Edge Function

**Files:**
- Create: `supabase/functions/report-crash/index.ts`
- Create: `supabase/functions/report-crash/crash-payload.mjs`
- Create: `supabase/functions/report-crash/crash-payload.test.mjs`
- Modify: `.github/workflows/test-supabase-helpers.yml`

**Interfaces:**
- Consumes POST JSON for allowed package `com.apkstore.client`.
- Produces 202/200 acknowledgement for accepted bounded event and explicit 4xx for malformed/oversized payloads.

- [ ] **Step 1: Write failing Node helper tests** for allowed package, positive version code, max field/stack lengths, timestamp sanity, fingerprint format, body size limit, and hostile/unknown keys.
- [ ] **Step 2: Run** helper workflow; expected FAIL because helper/function is absent.
- [ ] **Step 3: Implement** strict normalizer/sanitizer and Edge Function using service-role only server-side; truncate bounded fields before DB call.
- [ ] **Step 4: Add** rate limiting using the safest capability available in current Supabase project (DB time-window/IP hash or provider-level limit); document any provider limitation rather than pretending it is enforced.
- [ ] **Step 5: Run** helper tests and deploy function to staging/current project; send valid + malformed test payloads and verify expected HTTP statuses.
- [ ] **Step 6: Commit** `feat: add bounded crash ingest endpoint`.

### Task 3: Android local crash capture and queue

**Files:**
- Create: `apps/android/app/src/main/java/com/apkstore/client/CrashReporter.java`
- Create: `apps/android/app/src/main/java/com/apkstore/client/CrashQueue.java`
- Create: `apps/android/app/src/main/java/com/apkstore/client/CrashFingerprint.java`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java`
- Test: `apps/android/app/src/test/java/com/apkstore/client/CrashReporterTest.java`

**Interfaces:**
- Produces deterministic fingerprint from exception class + stable top frames and queue operations `enqueue`, `pending`, `acknowledge` with hard count/byte retention limits.

- [ ] **Step 1: Write failing tests** for stable fingerprint, message/stack sanitization, queue max-count/max-bytes eviction, malformed queued JSON handling, and no PII fields in serialized payload.
- [ ] **Step 2: Run** Android unit tests; expected FAIL.
- [ ] **Step 3: Implement** local app-private queue and uncaught handler that writes bounded JSON in a try/catch, then always delegates to previous/default handler.
- [ ] **Step 4: Install** reporter at the earliest safe point in app startup before normal catalog/UI work.
- [ ] **Step 5: Run** unit tests + debug build; expected PASS.
- [ ] **Step 6: Commit** `feat: capture bounded crash reports locally`.

### Task 4: Upload queued crashes after launch

**Files:**
- Create: `apps/android/app/src/main/java/com/apkstore/client/CrashUploadClient.java`
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java`
- Test: `apps/android/app/src/test/java/com/apkstore/client/CrashUploadClientTest.java`

**Interfaces:**
- Consumes queued crash JSON and HTTPS `report-crash` endpoint.
- Produces ack/delete only after successful server acknowledgement; failures remain queued.

- [ ] **Step 1: Write failing tests** for success acknowledgement, offline/server failure retention, malformed local event discard, and bounded retry behavior.
- [ ] **Step 2: Run** tests; expected FAIL.
- [ ] **Step 3: Implement** asynchronous upload after launch using existing worker/executor style, HTTPS only, sane connect/read timeouts, no startup blocking.
- [ ] **Step 4: Run** tests + `assembleDebug`; expected PASS.
- [ ] **Step 5: Commit** `feat: upload queued crash diagnostics`.

### Task 5: Owner-only crash admin APIs

**Files:**
- Create: `apps/web/app/api/admin/crashes/route.ts`
- Create: `apps/web/app/api/admin/crashes/[fingerprint]/route.ts`
- Create: `apps/web/lib/admin/crashes.ts`
- Test/Create: `apps/web/tests/crashes.test.ts`

**Interfaces:**
- Produces authenticated GET summary/list/detail data and PATCH status action accepting only `open|resolved|ignored`.

- [ ] **Step 1: Write failing unit tests** for owner-required access, invalid fingerprint/status rejection, sanitized result shape, and audit-log call on state change.
- [ ] **Step 2: Run** `npm run test:unit`; expected FAIL.
- [ ] **Step 3: Implement** server-side queries using existing `requireOwner`/service-role server client; never expose service-role to browser.
- [ ] **Step 4: Write** status change into existing admin audit log with actor/action/timestamp/fingerprint.
- [ ] **Step 5: Run** unit tests, typecheck, production build; expected PASS.
- [ ] **Step 6: Commit** `feat: add owner crash admin api`.

### Task 6: Admin Crashes dashboard

**Files:**
- Create: `apps/web/app/admin/crashes/page.tsx`
- Create: `apps/web/components/crash-dashboard.tsx`
- Modify: the existing authenticated admin navigation/layout component found during implementation.
- Test: `apps/web/tests/crashes.test.ts`
- Browser test: add/update Playwright spec under `apps/web/tests/`.

**Interfaces:**
- Consumes Task 5 APIs.
- Produces Crashes screen with open count, reports, fingerprint/title, versions, Android/device models, first/last seen, count, latest sanitized stack, Open/Resolved/Ignored controls.

- [ ] **Step 1: Add failing UI/unit/browser assertions** that Crashes navigation exists for admin, data renders, status control sends PATCH, and unauthenticated route redirects/denies.
- [ ] **Step 2: Run** relevant tests; expected FAIL.
- [ ] **Step 3: Implement** dashboard using current visual system; no redesign.
- [ ] **Step 4: Run** unit tests, typecheck, production build, and browser test where environment supports it; expected PASS.
- [ ] **Step 5: Commit** `feat: add admin crash dashboard`.

### Task 7: Privacy copy and end-to-end controlled crash verification

**Files:**
- Modify: `apps/android/app/src/main/java/com/apkstore/client/MainActivity.java` privacy policy copy
- Update: `docs/APK-STORE_FULL_AUDIT_REPORT.md`

- [ ] **Step 1: Update privacy text** to disclose first-party technical crash diagnostics, fields/purpose, infrastructure IP/log processing, and absence of third-party analytics SDK.
- [ ] **Step 2: Add a test-only controlled crash trigger** that is excluded/disabled from release UI, or use an instrumentation-only fixture; do not ship a user-visible crash button.
- [ ] **Step 3: Verify** controlled crash creates local queue entry, process terminates normally, next launch uploads, server records aggregate/event, and authenticated Admin -> Crashes displays it.
- [ ] **Step 4: Verify** malformed ingest is rejected and unauthenticated crash-table/admin reads fail.
- [ ] **Step 5: Run** full Android build/tests + web unit/typecheck/build + Supabase helper tests; record exact run IDs/status in audit report.
- [ ] **Step 6: Commit** `docs: verify crash reporting end to end`.
