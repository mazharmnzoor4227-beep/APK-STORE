create table public.upload_candidates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  filename text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  object_key text not null unique,
  status text not null default 'uploading' check (status in ('uploading','uploaded','inspected','invalid')),
  expires_at timestamptz not null default (now() + interval '2 hours'),
  inspection jsonb,
  error text,
  created_at timestamptz not null default now()
);
alter table public.upload_candidates enable row level security;
revoke all on public.upload_candidates from anon, authenticated;
create index upload_candidates_owner on public.upload_candidates(owner_id, created_at desc);
