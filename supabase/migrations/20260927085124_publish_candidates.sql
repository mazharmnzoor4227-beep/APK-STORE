alter table public.upload_candidates drop constraint upload_candidates_status_check;
alter table public.upload_candidates add constraint upload_candidates_status_check
  check (status in ('uploading','uploaded','inspected','invalid','published','rejected'));
alter table public.upload_candidates add column target_app_id uuid references public.apps(id);

create table public.candidate_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.upload_candidates(id),
  actor_id uuid not null,
  action text not null check (action in ('approved','rejected')),
  reason text,
  created_at timestamptz not null default now()
);
alter table public.candidate_events enable row level security;
revoke all on public.candidate_events from anon, authenticated;

create function public.publish_candidate(
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
  insert into public.releases (app_id, package_id, version_code, version_name, certificate_sha256, apk_sha256, byte_size, storage_key, release_notes, source, status, published_at)
  values (v_app_id, v_package_id, version_code, candidate.inspection->>'versionName', certificate, candidate.inspection->>'apkSha256', candidate.byte_size, candidate.object_key, p_release_notes, 'upload', 'published', now())
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

create function public.reject_candidate(p_candidate_id uuid, p_actor_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare candidate public.upload_candidates%rowtype;
begin
  select * into candidate from public.upload_candidates where id = p_candidate_id for update;
  if not found or candidate.status not in ('uploaded','inspected') then raise exception 'Candidate cannot be rejected'; end if;
  if candidate.owner_id <> p_actor_id then raise exception 'Owner mismatch'; end if;
  update public.upload_candidates set status = 'rejected', error = left(p_reason, 300) where id = p_candidate_id;
  insert into public.candidate_events (candidate_id, actor_id, action, reason)
  values (p_candidate_id, p_actor_id, 'rejected', left(p_reason, 300));
end $$;
revoke all on function public.reject_candidate(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.reject_candidate(uuid,uuid,text) to service_role;
