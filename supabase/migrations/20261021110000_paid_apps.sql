-- Paid apps (owner order 2026-10-21): manual-confirm purchase flow.
-- The owner confirms payments by hand; confirming a purchase request creates
-- an entitlement, and the customer's app then unlocks Install.
-- Apply in the Supabase SQL editor (Dashboard -> SQL Editor -> paste -> Run).
-- The payment-proofs storage bucket already exists (created via the Storage
-- API); this script creates the tables, the price column and all RLS/storage
-- policies. No payment values are seeded: the owner fills Payment Settings
-- from the admin panel himself.

alter table public.apps
  add column if not exists price_pkr integer not null default 0;

create table if not exists public.payment_settings (
  id integer primary key check (id = 1),
  bank_name text not null default '',
  account_title text not null default '',
  iban text not null default '',
  easypaisa_number text not null default '',
  jazzcash_number text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.payment_settings (id) values (1)
  on conflict (id) do nothing;

create table if not exists public.purchase_requests (
  id uuid primary key,
  app_id uuid not null references public.apps(id) on delete cascade,
  customer_email text not null,
  customer_phone text not null default '',
  screenshot_path text not null default '',
  amount_pkr integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists public.entitlements (
  email text not null,
  app_id uuid not null references public.apps(id) on delete cascade,
  granted_at timestamptz not null default now(),
  primary key (email, app_id)
);

create index if not exists purchase_requests_status_idx
  on public.purchase_requests (status, created_at desc);
create index if not exists entitlements_email_idx
  on public.entitlements (lower(email));

alter table public.payment_settings enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.entitlements enable row level security;

-- payment_settings: the store app reads the published details at checkout;
-- only the owner may write.
drop policy if exists "payment_settings_read" on public.payment_settings;
create policy "payment_settings_read" on public.payment_settings
  for select using (true);
drop policy if exists "payment_settings_owner_write" on public.payment_settings;
create policy "payment_settings_owner_write" on public.payment_settings
  for all
  using (lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com');

-- purchase_requests: any customer may create a PENDING request; the row id
-- (a UUID generated on the phone) is the customer's receipt — knowing it is
-- what lets a guest re-check their own request's status. Only the owner may
-- change a request (confirm/reject) or create entitlements.
drop policy if exists "purchase_insert_pending" on public.purchase_requests;
create policy "purchase_insert_pending" on public.purchase_requests
  for insert with check (status = 'pending');
drop policy if exists "purchase_read_by_id" on public.purchase_requests;
create policy "purchase_read_by_id" on public.purchase_requests
  for select using (true);
drop policy if exists "purchase_owner_write" on public.purchase_requests;
create policy "purchase_owner_write" on public.purchase_requests
  for all
  using (lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com');

-- entitlements: a signed-in customer reads only their own rows (matched on
-- the email in their auth token); the owner manages everything.
drop policy if exists "entitlements_read_own" on public.entitlements;
create policy "entitlements_read_own" on public.entitlements
  for select
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
drop policy if exists "entitlements_owner_write" on public.entitlements;
create policy "entitlements_owner_write" on public.entitlements
  for all
  using (lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com');

-- payment-proofs bucket: customers may upload a proof; only the owner reads.
drop policy if exists "proofs_insert" on storage.objects;
create policy "proofs_insert" on storage.objects
  for insert with check (bucket_id = 'payment-proofs');
drop policy if exists "proofs_owner_read" on storage.objects;
create policy "proofs_owner_read" on storage.objects
  for select using (bucket_id = 'payment-proofs'
    and lower(auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com');
