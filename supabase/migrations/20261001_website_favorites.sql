-- APK STORE website: per-user favorites (synced across devices)
-- Run this ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- (Website works without it too: favorites then stay on the device only.)

create table if not exists public.favorites (
  user_id  uuid not null references auth.users(id) on delete cascade,
  app_slug text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, app_slug)
);

alter table public.favorites enable row level security;

drop policy if exists "favorites_own" on public.favorites;
create policy "favorites_own" on public.favorites
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
