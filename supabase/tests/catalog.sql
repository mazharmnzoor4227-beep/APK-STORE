-- Run against a disposable development database. This transaction never persists fixtures.
begin;

insert into public.apps (slug, package_id, title, category, visibility)
values ('public-test', 'dev.apkstore.public', 'Public Test', 'Tools', 'draft'),
       ('draft-test', 'dev.apkstore.draft', 'Draft Test', 'Tools', 'draft');

insert into public.releases (app_id, package_id, version_code, version_name, certificate_sha256, apk_sha256, byte_size, storage_key, source, status)
select id, package_id, 1, '1.0.0', repeat('a',64), repeat('b',64), 100, 'test-public.apk', 'upload', 'published'
from public.apps where slug = 'public-test';

update public.apps set visibility = 'published', current_release_id =
  (select id from public.releases where storage_key = 'test-public.apk')
where slug = 'public-test';

set local role anon;
do $$
declare public_count integer;
declare draft_count integer;
begin
  select count(*) into public_count from public.apps where slug = 'public-test';
  select count(*) into draft_count from public.apps where slug = 'draft-test';
  if public_count <> 1 or draft_count <> 0 then
    raise exception 'anon visibility failed: public %, draft %', public_count, draft_count;
  end if;
end $$;
reset role;

do $$
begin
  if not (select exists(select 1 from storage.buckets where id = 'apk-files' and public = false)) then
    raise exception 'APK bucket must be private';
  end if;
  if exists(select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and roles::text like '%anon%' and cmd = 'SELECT') then
    raise exception 'anonymous storage read policy present';
  end if;
end $$;

do $$
begin
  begin
    insert into public.apps (slug, package_id, title, category, visibility)
    values ('duplicate-test', 'dev.apkstore.public', 'Duplicate', 'Tools', 'draft');
    raise exception 'package ID uniqueness not enforced';
  exception when unique_violation then null;
  end;
end $$;

rollback;
