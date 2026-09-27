import { adminDatabase } from '../../../../lib/admin/server';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return Response.json({ error: 'App not found' }, { status: 404 });
  try {
    const db = adminDatabase();
    const { data: app, error } = await db.from('apps').select('id,current_release_id').eq('slug', slug).eq('visibility', 'published').single();
    if (error || !app?.current_release_id) return Response.json({ error: 'App not found' }, { status: 404 });
    const { data: release } = await db.from('releases').select('storage_key,package_id').eq('id', app.current_release_id).eq('app_id', app.id).eq('status', 'published').single();
    if (!release) return Response.json({ error: 'Release not found' }, { status: 404 });
    const signed = await db.storage.from('apk-files').createSignedUrl(release.storage_key, 60, { download: `${release.package_id}.apk` });
    if (signed.error || !signed.data) throw new Error('Download unavailable');
    return Response.redirect(signed.data.signedUrl, 302);
  } catch { return Response.json({ error: 'Download temporarily unavailable' }, { status: 503 }); }
}
