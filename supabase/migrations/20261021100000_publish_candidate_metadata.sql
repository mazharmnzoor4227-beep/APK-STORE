-- publish_candidate: also fill releases.changelog and releases.permissions.
--
-- The original function (20260927085124_publish_candidates.sql) predates the
-- store metadata columns added in 20260928_store_metadata.sql
-- (releases.changelog text default '', releases.permissions text[] default
-- '{}'), so every app published through the admin upload flow landed with an
-- empty Changelog and empty Permissions even though inspection had parsed
-- the permissions and the owner had typed release notes. This revision only
-- extends the release INSERT: changelog mirrors the release notes text and
-- permissions come from the candidate inspection JSON. Everything else —
-- package match, certificate match, increasing version code, events — is
-- byte-identical to the original definition.
--
-- Note: the admin-upload edge function also mirrors these two fields onto
-- the new release after calling the RPC, so behavior is correct even before
-- this migration is applied; both writes set the same values.

create or replace function public.publish_candidate(
  p_candidate_id uuid, p_actor_id uuid, p_slug text, p_title text,
  p_category text, p_description text, p_release_notes text, p_target_app_id uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate public.upload_candidates%rowtype;
  v_app_id uuid;
  old_release public.releases%rowtype;
  new_release_id uuid;
  v_package_id text;
  version_code bigint;
  certificate text;
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
  if p_target_app_id is not null then
    select id into v_app_id from public.apps where id = p_target_app_id for update;
    if v_app_id is null then raise exception 'Target app not found'; end if;
    if (select a.package_id from public.apps a where a.id = v_app_id) <> v_package_id then
      raise exception 'Package ID does not match the selected app';
    end if;
  else
    select id into v_app_id from public.apps where apps.package_id = v_package_id for update;
  end if;
  if v_app_id is null then
    insert into public.apps (slug, package_id, title, category, description)
    values (p_slug, v_package_id, p_title, p_category, p_description) returning id into v_app_id;
  else
    select r.* into old_release from public.apps a join public.releases r on r.id = a.current_release_id where a.id = v_app_id;
    if old_release.id is not null then
      if old_release.certificate_sha256 <> certificate then raise exception 'Signing certificate does not match'; end if;
      if version_code <= old_release.version_code then raise exception 'Version code must increase'; end if;
    end if;
  end if;
  insert into public.releases (app_id, package_id, version_code, version_name, certificate_sha256, apk_sha256, byte_size, storage_key, release_notes, changelog, permissions, source, status, published_at)
  values (v_app_id, v_package_id, version_code, candidate.inspection->>'versionName', certificate, candidate.inspection->>'apkSha256', candidate.byte_size, candidate.object_key, p_release_notes, p_release_notes,
    coalesce((select array_agg(elem) from jsonb_array_elements_text(coalesce(candidate.inspection->'permissions', '[]'::jsonb)) as elem), '{}'::text[]),
    'upload', 'published', now())
  returning id into new_release_id;
  update public.apps set slug = p_slug, title = p_title, category = p_category, description = p_description,
    current_release_id = new_release_id, visibility = 'published', updated_at = now() where id = v_app_id;
  update public.upload_candidates set status = 'published', target_app_id = v_app_id where id = p_candidate_id;
  insert into public.review_events (release_id, actor_id, action) values (new_release_id, p_actor_id, 'approved');
  insert into public.candidate_events (candidate_id, actor_id, action) values (p_candidate_id, p_actor_id, 'approved');
  return v_app_id;
end $$;

revoke all on function public.publish_candidate(uuid,uuid,text,text,text,text,text,uuid) from public, anon, authenticated;
grant execute on function public.publish_candidate(uuid,uuid,text,text,text,text,text,uuid) to service_role;
