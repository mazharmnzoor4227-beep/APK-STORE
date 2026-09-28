create table if not exists public.admin_audit (
  id uuid primary key default gen_random_uuid(), actor_id uuid not null,
  action text not null, subject_id uuid not null, subject_name text not null,
  details jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;

create or replace function public.purge_deleted_app(p_app_id uuid,p_actor_id uuid,p_expected_title text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.apps%rowtype;
begin
  select * into v_app from public.apps where id=p_app_id for update;
  if not found or v_app.deleted_at is null then raise exception 'App is not in Trash'; end if;
  if v_app.title <> p_expected_title then raise exception 'App name does not match'; end if;
  update public.apps set current_release_id=null where id=p_app_id;
  delete from public.review_events where release_id in (select id from public.releases where app_id=p_app_id);
  delete from public.candidate_events where candidate_id in (select id from public.upload_candidates where target_app_id=p_app_id);
  delete from public.upload_candidates where target_app_id=p_app_id;
  delete from public.media where app_id=p_app_id;
  delete from public.releases where app_id=p_app_id;
  delete from public.apps where id=p_app_id;
  insert into public.admin_audit(actor_id,action,subject_id,subject_name) values(p_actor_id,'purge',p_app_id,v_app.title);
end $$;
revoke all on function public.purge_deleted_app(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.purge_deleted_app(uuid,uuid,text) to service_role;

create or replace function public.owner_delete_app(p_app_id uuid,p_actor_id uuid,p_expected_title text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.apps%rowtype;
begin
  select * into v_app from public.apps where id=p_app_id for update;
  if not found then raise exception 'App not found'; end if;
  if v_app.deleted_at is not null then raise exception 'App is already in Trash'; end if;
  if v_app.title <> p_expected_title then raise exception 'App name does not match'; end if;
  update public.apps set visibility='unlisted',deleted_at=now(),updated_at=now() where id=p_app_id;
  insert into public.admin_audit(actor_id,action,subject_id,subject_name) values(p_actor_id,'delete',p_app_id,v_app.title);
end $$;
revoke all on function public.owner_delete_app(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.owner_delete_app(uuid,uuid,text) to service_role;

create or replace function public.owner_restore_app(p_app_id uuid,p_actor_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_app public.apps%rowtype;
begin
  select * into v_app from public.apps where id=p_app_id for update;
  if not found or v_app.deleted_at is null then raise exception 'App is not in Trash'; end if;
  update public.apps set visibility='unlisted',deleted_at=null,updated_at=now() where id=p_app_id;
  insert into public.admin_audit(actor_id,action,subject_id,subject_name) values(p_actor_id,'restore',p_app_id,v_app.title);
end $$;
revoke all on function public.owner_restore_app(uuid,uuid) from public,anon,authenticated;
grant execute on function public.owner_restore_app(uuid,uuid) to service_role;
