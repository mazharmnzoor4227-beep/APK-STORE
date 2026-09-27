begin;
insert into public.upload_candidates (id, owner_id, filename, byte_size, object_key, status, inspection)
values ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'test.apk', 1024, 'candidates/test-publish.apk', 'inspected',
  jsonb_build_object('packageId','dev.apkstore.test','versionCode',1,'versionName','1.0','certificateSha256',repeat('a',64),'apkSha256',repeat('b',64),'byteSize',1024));

do $$
declare app_id uuid;
declare published uuid;
begin
  app_id := public.publish_candidate('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'test-app', 'Test App', 'Tools', 'Description', 'First version', null);
  select current_release_id into published from public.apps where id = app_id;
  if published is null or not exists (select 1 from public.releases where id = published and status = 'published' and version_code = 1) then
    raise exception 'first approval did not publish';
  end if;
  if (select count(*) from public.review_events where release_id = published and action = 'approved') <> 1 then
    raise exception 'approval audit event missing';
  end if;
end $$;
rollback;
