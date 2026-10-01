-- APK STORE website CMS settings, managed from the admin panel.
-- Keys: 'hero_slots' (ordered hero carousel, up to 6 apps), 'announcement' (top banner).
-- Reads are public (the website loads them without login).
-- Writes are owner-only (the admin panel writes with the owner's JWT).

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "site_settings public read" on public.site_settings;
create policy "site_settings public read" on public.site_settings
  for select using (true);

drop policy if exists "site_settings owner write" on public.site_settings;
create policy "site_settings owner write" on public.site_settings
  for all
  using ((auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com')
  with check ((auth.jwt() ->> 'email') = 'mazharmanzoor4117@gmail.com');

-- Seed defaults: 6 empty hero slots (all enabled), announcement banner off.
insert into public.site_settings (key, value) values
  ('hero_slots', jsonb_build_object('slots',
    (select jsonb_agg(jsonb_build_object('app_id', null, 'enabled', true) order by g)
     from generate_series(1, 6) g))),
  ('announcement', '{"enabled": false, "text": ""}'::jsonb)
on conflict (key) do nothing;
