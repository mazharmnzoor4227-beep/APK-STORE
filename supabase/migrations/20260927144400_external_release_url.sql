-- A vetted APK can be served from APK STORE's own public site instead of
-- duplicating the binary in private Storage. Other hosts remain disallowed.
alter table public.releases add column external_url text;
alter table public.releases add constraint release_external_url_trusted_host
  check (external_url is null or
    external_url ~ '^https://apk-store-mazhar[.]mazharmanzoor4117[.]chatgpt[.]site/[A-Za-z0-9._-]+[.]apk$');
