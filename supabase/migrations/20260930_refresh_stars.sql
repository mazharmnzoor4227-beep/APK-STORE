-- Daily GitHub star snapshots for verified published repositories.
create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function public.refresh_github_stars()
returns integer language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  listing record;
  response extensions.http_response;
  new_stars integer;
  changed integer := 0;
begin
  for listing in
    select id, github_owner, github_repo from public.apps
    where visibility = 'published' and github_owner ~ '^[A-Za-z0-9-]{1,39}$'
      and github_repo ~ '^[A-Za-z0-9._-]{1,100}$'
  loop
    begin
      select * into response from extensions.http_get(
        'https://api.github.com/repos/' || listing.github_owner || '/' || listing.github_repo);
      if response.status = 200 then
        new_stars := (response.content::jsonb->>'stargazers_count')::integer;
        if new_stars >= 0 then
          update public.apps set stars = new_stars where id = listing.id and stars is distinct from new_stars;
          changed := changed + 1;
        end if;
      end if;
    exception when others then
      -- One unavailable repository must not stop refresh of the rest.
      continue;
    end;
  end loop;
  return changed;
end $$;
revoke all on function public.refresh_github_stars() from public, anon, authenticated;
grant execute on function public.refresh_github_stars() to service_role;

select cron.schedule('apk-store-refresh-github-stars', '15 3 * * *',
  'select public.refresh_github_stars()');
