alter table public.apps add column if not exists icon_url text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('app-icons', 'app-icons', true, 1048576, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
