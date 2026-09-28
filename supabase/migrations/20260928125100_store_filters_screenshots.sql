-- Published metadata remains service-role managed; anon has only existing read policies.
alter table public.apps add column if not exists price_type text not null default 'Free'
  check (price_type in ('Free','In-app purchases','In-app purchases or Paid'));
alter table public.apps add column if not exists fdroid_url text;
alter table public.apps add column if not exists vendor text;
alter table public.categories add column if not exists "group" text not null default 'normal'
  check ("group" in ('normal','vendor-specific'));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('app-screenshots','app-screenshots',true,307200,array['image/webp'])
on conflict (id) do update set public=true,file_size_limit=307200,allowed_mime_types=array['image/webp'];
-- No upload policies: only a privileged operator can add or change screenshots.
