import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const { data, error } = await adminDatabase().from('apps')
      .select('id,slug,title,package_id,icon_url,visibility,deleted_at,updated_at')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return Response.json({ apps: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Trash unavailable';
    const status = /owner|token|sign|session|auth/i.test(message) ? 401 : 503;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
