-- APK STORE self-update is intentionally hidden by the client CatalogPolicy,
-- but the update checker and download-apk Edge Function both require the
-- canonical APK STORE row itself to be visibility='published'.
-- Keep that backend contract intact so installed versions can discover and
-- download the current signed release.

update public.apps
set visibility = 'published',
    updated_at = now()
where slug = 'apk-store-client'
  and package_id = 'com.apkstore.client'
  and current_release_id is not null
  and visibility <> 'published';
