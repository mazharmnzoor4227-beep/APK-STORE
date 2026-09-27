create table public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  package_id text not null unique check (package_id ~ '^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$'),
  title text not null check (length(trim(title)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  description text not null default '',
  visibility text not null default 'draft' check (visibility in ('draft', 'published', 'unlisted')),
  current_release_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.releases (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete restrict,
  package_id text not null,
  version_code bigint not null check (version_code > 0),
  version_name text not null check (length(version_name) > 0),
  certificate_sha256 text not null check (certificate_sha256 ~ '^[a-f0-9]{64}$'),
  apk_sha256 text not null check (apk_sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  storage_key text not null unique,
  release_notes text not null default '',
  source text not null check (source in ('upload', 'github')),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (app_id, version_code),
  unique (app_id, id)
);

alter table public.apps add constraint current_release_belongs_to_app
  foreign key (id, current_release_id) references public.releases(app_id, id) deferrable initially deferred;

create table public.media (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references public.apps(id) on delete cascade,
  kind text not null check (kind in ('icon', 'screenshot')),
  storage_key text not null unique,
  display_order integer not null default 0 check (display_order >= 0),
  created_at timestamptz not null default now()
);

create table public.review_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete restrict,
  actor_id uuid not null,
  action text not null check (action in ('approved', 'rejected')),
  reason text,
  created_at timestamptz not null default now()
);

create index apps_public_order on public.apps(created_at desc, id desc) where visibility = 'published';
create index releases_app_status on public.releases(app_id, status, version_code desc);
create index media_app_order on public.media(app_id, display_order);

alter table public.apps enable row level security;
alter table public.releases enable row level security;
alter table public.media enable row level security;
alter table public.review_events enable row level security;

revoke all on public.apps, public.releases, public.media, public.review_events from anon, authenticated;
grant select on public.apps, public.releases, public.media to anon, authenticated;

create policy "Published apps readable" on public.apps for select to anon, authenticated
  using (visibility = 'published' and current_release_id is not null);
create policy "Published releases readable" on public.releases for select to anon, authenticated
  using (status = 'published' and exists (
    select 1 from public.apps a where a.id = app_id and a.visibility = 'published' and a.current_release_id = releases.id
  ));
create policy "Published media readable" on public.media for select to anon, authenticated
  using (exists (select 1 from public.apps a where a.id = app_id and a.visibility = 'published'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apk-files', 'apk-files', false, 52428800, array['application/vnd.android.package-archive', 'application/octet-stream'])
on conflict (id) do nothing;

-- No browser role can read/write APK objects directly. Privileged server code
-- creates scoped upload and download URLs after checking owner/publication.
