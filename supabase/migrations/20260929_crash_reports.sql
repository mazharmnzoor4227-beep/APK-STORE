-- Crash reports table for self-hosted crash reporting.
-- Run this in the Supabase SQL editor (service role / owner only).
create table if not exists public.crash_reports (
  id uuid primary key default gen_random_uuid(),
  package_id text,
  app_version text,
  version_code integer,
  android_version text,
  device_model text,
  exception_type text,
  message text,
  stack text,
  screen text,
  device_id text,
  created_at timestamptz not null default now()
);

-- No public access: only the crash-report Edge Function (service role) writes.
alter table public.crash_reports enable row level security;
-- Intentionally no policies: anon gets nothing. Owner reads via dashboard / service role.
