-- Lock APK STORE to one permanent package, slug, and release signing certificate.
create table if not exists public.store_release_identity (
  singleton boolean primary key default true check (singleton),
  package_id text not null check (package_id = 'com.apkstore.client'),
  slug text not null check (slug = 'apk-store'),
  signer_sha256 text not null check (signer_sha256 ~ '^[0-9a-f]{64}$'),
  configured_at timestamptz not null default now()
);

insert into public.store_release_identity(singleton,package_id,slug,signer_sha256)
values (true,'com.apkstore.client','apk-store','4c8a4d67022c354b62db264461e0d4f9cc16f6ea3c0cbce204fb7a9f7708ac60')
on conflict (singleton) do nothing;

alter table public.store_release_identity enable row level security;
revoke all on public.store_release_identity from public, anon, authenticated;
grant select on public.store_release_identity to service_role;

create or replace function public.enforce_store_app_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.package_id = 'com.apkstore.client' or new.slug = 'apk-store'
      or (tg_op = 'UPDATE' and (old.package_id = 'com.apkstore.client' or old.slug = 'apk-store')))
     and (new.package_id <> 'com.apkstore.client' or new.slug <> 'apk-store') then
    raise exception 'APK STORE package ID and slug are permanent';
  end if;
  return new;
end $$;

drop trigger if exists apps_store_identity_guard on public.apps;
create trigger apps_store_identity_guard
before insert or update on public.apps
for each row execute function public.enforce_store_app_identity();

create or replace function public.enforce_store_release_identity()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare
  v_package text;
  v_slug text;
  v_signer text;
  v_max_version bigint;
begin
  select package_id,slug into v_package,v_slug from public.apps where id = new.app_id;
  if v_package = 'com.apkstore.client' or v_slug = 'apk-store' then
    if v_package <> 'com.apkstore.client' or v_slug <> 'apk-store' or new.package_id <> 'com.apkstore.client' then
      raise exception 'APK STORE release identity is invalid';
    end if;
    select signer_sha256 into v_signer from public.store_release_identity where singleton;
    if v_signer is null or new.certificate_sha256 <> v_signer then
      raise exception 'APK STORE release signer does not match permanent signer';
    end if;
    if tg_op = 'INSERT' then
      select max(version_code) into v_max_version from public.releases where app_id = new.app_id;
      if v_max_version is not null and new.version_code <= v_max_version then
        raise exception 'APK STORE version code must increase';
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists releases_store_identity_guard on public.releases;
create trigger releases_store_identity_guard
before insert or update on public.releases
for each row execute function public.enforce_store_release_identity();

create or replace function public.publish_candidate(
  p_candidate_id uuid, p_actor_id uuid, p_slug text, p_title text,
  p_category text, p_description text, p_release_notes text, p_target_app_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.upload_candidates%rowtype;
  existing_app public.apps%rowtype;
  v_app_id uuid;
  old_release public.releases%rowtype;
  new_release_id uuid;
  v_package_id text;
  version_code bigint;
  certificate text;
  permanent_signer text;
begin
  select * into candidate from public.upload_candidates where id = p_candidate_id for update;
  if not found or candidate.status <> 'inspected' or candidate.inspection is null then
    raise exception 'Candidate is not ready for review';
  end if;
  if candidate.owner_id <> p_actor_id then raise exception 'Owner mismatch'; end if;
  v_package_id := candidate.inspection->>'packageId';
  version_code := (candidate.inspection->>'versionCode')::bigint;
  certificate := candidate.inspection->>'certificateSha256';
  if v_package_id is null or certificate !~ '^[a-f0-9]{64}$' or version_code <= 0 then
    raise exception 'Inspection metadata invalid';
  end if;

  if v_package_id = 'com.apkstore.client' then
    if p_slug <> 'apk-store' then raise exception 'APK STORE slug is permanent'; end if;
    select signer_sha256 into permanent_signer from public.store_release_identity where singleton;
    if permanent_signer is null or certificate <> permanent_signer then
      raise exception 'APK STORE release signer does not match permanent signer';
    end if;
  elsif p_slug = 'apk-store' then
    raise exception 'APK STORE slug is reserved';
  end if;

  if p_target_app_id is not null then
    select * into existing_app from public.apps where id = p_target_app_id for update;
    if existing_app.id is null then raise exception 'Target app not found'; end if;
    if existing_app.package_id <> v_package_id then raise exception 'Package ID does not match the selected app'; end if;
    v_app_id := existing_app.id;
  else
    select * into existing_app from public.apps where apps.package_id = v_package_id for update;
    v_app_id := existing_app.id;
  end if;

  if v_app_id is null then
    insert into public.apps (slug, package_id, title, category, description)
    values (p_slug, v_package_id, p_title, p_category, p_description) returning id into v_app_id;
  else
    select r.* into old_release from public.releases r where r.id = existing_app.current_release_id;
    if old_release.id is not null then
      -- A trashed pre-release APK STORE row may move once from its old test signer to the permanent signer.
      if not (v_package_id = 'com.apkstore.client' and existing_app.deleted_at is not null) then
        if old_release.certificate_sha256 <> certificate then raise exception 'Signing certificate does not match'; end if;
      end if;
      if version_code <= old_release.version_code then raise exception 'Version code must increase'; end if;
    end if;
  end if;

  insert into public.releases (app_id, package_id, version_code, version_name, certificate_sha256, apk_sha256, byte_size, storage_key, release_notes, source, status, published_at)
  values (v_app_id, v_package_id, version_code, candidate.inspection->>'versionName', certificate, candidate.inspection->>'apkSha256', candidate.byte_size, candidate.object_key, p_release_notes, 'upload', 'published', now())
  returning id into new_release_id;

  update public.apps set slug = p_slug, title = p_title, category = p_category, description = p_description,
    current_release_id = new_release_id, visibility = 'published', deleted_at = null, updated_at = now()
  where id = v_app_id;
  update public.upload_candidates set status = 'published', target_app_id = v_app_id where id = p_candidate_id;
  insert into public.review_events (release_id, actor_id, action) values (new_release_id, p_actor_id, 'approved');
  insert into public.candidate_events (candidate_id, actor_id, action) values (p_candidate_id, p_actor_id, 'approved');
  return v_app_id;
end $$;

revoke all on function public.publish_candidate(uuid,uuid,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.publish_candidate(uuid,uuid,text,text,text,text,text,uuid) to service_role;
