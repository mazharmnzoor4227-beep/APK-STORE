alter table public.apps
  add column if not exists icon_source_url text;

update public.apps
set icon_source_url = icon_url
where visibility = 'published'
  and icon_url is not null
  and (
    icon_url like 'https://f-droid.org/%'
    or icon_url like 'https://raw.githubusercontent.com/%'
  );

update public.apps
set icon_url = 'https://qfbfxencwsgryoczkdyj.supabase.co/functions/v1/app-icon?client=apkstore-android&slug=' || slug
where visibility = 'published'
  and icon_source_url is not null
  and (
    icon_source_url like 'https://f-droid.org/%'
    or icon_source_url like 'https://raw.githubusercontent.com/%'
  );
