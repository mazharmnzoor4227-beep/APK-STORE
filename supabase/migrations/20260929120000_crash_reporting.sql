-- First-party APK STORE crash reporting. Public clients have no direct table access.
create table if not exists public.crash_issues (
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  package_id text not null,
  title text not null check (char_length(title) between 1 and 180),
  exception_class text not null check (char_length(exception_class) between 1 and 180),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  event_count bigint not null default 1 check (event_count > 0),
  latest_version_code bigint not null check (latest_version_code > 0),
  latest_version_name text not null check (char_length(latest_version_name) <= 64),
  updated_at timestamptz not null default now()
);
create table if not exists public.crash_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null references public.crash_issues(fingerprint) on delete restrict,
  package_id text not null,
  version_code bigint not null check (version_code > 0),
  version_name text not null check (char_length(version_name) <= 64),
  android_sdk integer not null check (android_sdk between 26 and 100),
  device_manufacturer text not null check (char_length(device_manufacturer) <= 80),
  device_model text not null check (char_length(device_model) <= 120),
  exception_class text not null check (char_length(exception_class) <= 180),
  message text not null default '' check (char_length(message) <= 1000),
  stack_trace text not null check (char_length(stack_trace) <= 16000),
  occurred_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists crash_issues_status_last_seen_idx on public.crash_issues(status,last_seen_at desc);
create index if not exists crash_events_fingerprint_received_idx on public.crash_events(fingerprint,received_at desc);
alter table public.crash_issues enable row level security;
alter table public.crash_events enable row level security;
revoke all on public.crash_issues from anon, authenticated;
revoke all on public.crash_events from anon, authenticated;
