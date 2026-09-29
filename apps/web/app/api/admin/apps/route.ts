import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const db = adminDatabase();
    const { data, error } = await db.from('apps')
      .select('id,slug,title,package_id,category,description,short_description,icon_url,screenshots,license,source_url,fdroid_url,price_type,is_recommended,min_sdk,visibility,current_release_id,updated_at')
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }).limit(200);
    if (error) throw error;
    const ids = (data ?? []).map(app => app.current_release_id).filter((id): id is string => !!id);
    const { data: releases, error: releaseError } = ids.length
      ? await db.from('releases').select('id,version_code,version_name,status,byte_size,apk_sha256,certificate_sha256,release_notes').in('id', ids)
      : { data: [], error: null };
    if (releaseError) throw releaseError;
    const releaseById = new Map((releases ?? []).map(release => [release.id, release]));
    return Response.json({ apps: (data ?? []).map(app => ({ ...app, release: releaseById.get(app.current_release_id) ?? null })) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unavailable';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth|sign/i.test(message) ? 401 : 503 });
  }
}
