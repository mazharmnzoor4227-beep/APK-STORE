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

insert into public.categories(name,icon,sort_order,"group") values
  ('Device owner (DPM)','admin_panel_settings',25,'normal'),
  ('Terminals','terminal',26,'normal'),
  ('Google Pixel','smartphone',27,'vendor-specific'),
  ('MIUI','smartphone',28,'vendor-specific'),
  ('Other','smartphone',29,'vendor-specific'),
  ('Samsung OneUI','smartphone',30,'vendor-specific')
on conflict (name) do nothing;
update public.categories set icon=case name
  when 'All' then 'done_all' when 'AI agents' then 'smart_toy'
  when 'Android Auto' then 'directions_car' when 'Android TV' then 'tv'
  when 'Audio' then 'graphic_eq' when 'Automation' then 'bolt'
  when 'Communication' then 'chat_bubble' when 'Customization' then 'palette'
  when 'Development utilities' then 'code' when 'Display management' then 'desktop_windows'
  when 'Entertainment' then 'movie' when 'File management' then 'folder'
  when 'Games' then 'sports_esports' when 'Input methods' then 'keyboard'
  when 'Installer & app stores' then 'store' when 'Miscellaneous' then 'category'
  when 'Network' then 'wifi' when 'Patching' then 'build'
  when 'Power management' then 'battery_full' when 'Privacy' then 'lock'
  when 'Productivity' then 'task_alt' when 'Quick settings' then 'tune'
  when 'Shizuku implementations' then 'extension'
  when 'Software management' then 'settings_applications'
  when 'Task manager' then 'list_alt' else icon end where icon='◈';
