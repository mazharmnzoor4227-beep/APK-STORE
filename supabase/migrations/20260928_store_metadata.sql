-- Metadata is editorial: the service role publishes reviewed listings.
alter table public.apps
  add column if not exists github_owner text,
  add column if not exists github_repo text,
  add column if not exists license text,
  add column if not exists min_sdk integer check (min_sdk is null or min_sdk >= 1),
  add column if not exists short_description text not null default '',
  add column if not exists screenshots text[] not null default '{}',
  add column if not exists is_recommended boolean not null default false,
  add column if not exists stars integer not null default 0 check (stars >= 0),
  add column if not exists source_url text;

alter table public.releases
  add column if not exists changelog text not null default '',
  add column if not exists permissions text[] not null default '{}';

-- Canonical existing fields: apk_sha256 (sha256), byte_size (size_bytes),
-- release_notes (legacy changelog), version_name and published_at.
create table if not exists public.categories (
  name text primary key,
  icon text not null default '◈',
  sort_order integer not null unique
);
insert into public.categories(name, sort_order) values
  ('All',0),('AI agents',1),('Android Auto',2),('Android TV',3),('Audio',4),
  ('Automation',5),('Communication',6),('Customization',7),('Development utilities',8),
  ('Display management',9),('Entertainment',10),('File management',11),('Games',12),
  ('Input methods',13),('Installer & app stores',14),('Miscellaneous',15),('Network',16),
  ('Patching',17),('Power management',18),('Privacy',19),('Productivity',20),
  ('Quick settings',21),('Shizuku implementations',22),('Software management',23),('Task manager',24)
on conflict (name) do nothing;
alter table public.categories enable row level security;
revoke all on public.categories from anon, authenticated;
grant select on public.categories to anon, authenticated;
create policy "Categories readable" on public.categories for select to anon, authenticated using (true);

-- Public URLs can read icons. No client role may upload, edit, or remove objects.
revoke insert, update, delete on storage.objects from anon;
