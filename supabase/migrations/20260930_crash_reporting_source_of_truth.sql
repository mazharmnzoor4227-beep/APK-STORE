-- Repository source-of-truth for the crash reporting schema already deployed in Supabase.
create extension if not exists pgcrypto;

create table if not exists public.crash_reports (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null,
  package_id text not null,
  version_code bigint not null,
  version_name text not null,
  android_sdk integer,
  device_manufacturer text,
  device_model text,
  exception_class text not null,
  message text not null default '',
  stack_trace text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  report_type text not null default 'crash' check (report_type in ('crash','handled'))
);

alter table public.crash_reports enable row level security;
revoke all on public.crash_reports from anon, authenticated;

create or replace function public.record_crash_report(
  p_fingerprint text, p_package_id text, p_version_code bigint, p_version_name text,
  p_android_sdk integer, p_device_manufacturer text, p_device_model text,
  p_exception_class text, p_message text, p_stack_trace text,
  p_occurred_at timestamptz, p_report_type text default 'crash'
) returns uuid
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  if p_package_id <> 'com.apkstore.client' then raise exception 'invalid package'; end if;
  if p_fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'invalid fingerprint'; end if;
  if p_version_code is null or p_version_code <= 0 then raise exception 'invalid version'; end if;
  if p_report_type not in ('crash','handled') then raise exception 'invalid report type'; end if;
  insert into public.crash_reports (
    fingerprint, package_id, version_code, version_name, android_sdk,
    device_manufacturer, device_model, exception_class, message, stack_trace,
    occurred_at, report_type
  ) values (
    p_fingerprint, p_package_id, p_version_code, left(p_version_name,64), p_android_sdk,
    left(coalesce(p_device_manufacturer,''),80), left(coalesce(p_device_model,''),120),
    left(p_exception_class,180), left(coalesce(p_message,''),2048),
    left(p_stack_trace,32768), p_occurred_at, p_report_type
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.record_crash_report(text,text,bigint,text,integer,text,text,text,text,text,timestamptz,text) from public, anon, authenticated;
grant execute on function public.record_crash_report(text,text,bigint,text,integer,text,text,text,text,text,timestamptz,text) to service_role;
