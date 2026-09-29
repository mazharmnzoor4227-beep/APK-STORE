create table if not exists public.admin_error_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (char_length(source) between 1 and 120),
  message text not null check (char_length(message) between 1 and 1000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_error_events_created_idx on public.admin_error_events(created_at desc);
alter table public.admin_error_events enable row level security;
revoke all on public.admin_error_events from anon, authenticated;
