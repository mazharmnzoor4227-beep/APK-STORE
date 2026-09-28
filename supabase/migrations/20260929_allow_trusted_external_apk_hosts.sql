alter table public.releases drop constraint if exists release_external_url_trusted_host;

alter table public.releases add constraint release_external_url_trusted_host check (
  external_url is null
  or external_url ~ '^https://apk-store-mazhar[.]mazharmanzoor4117[.]chatgpt[.]site/[A-Za-z0-9._-]+[.]apk$'
  or external_url ~ '^https://github[.]com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/releases/download/[^/]+/[^/]+[.]apk$'
  or external_url ~ '^https://f-droid[.]org/repo/[A-Za-z0-9._-]+_[0-9]+[.]apk$'
);
