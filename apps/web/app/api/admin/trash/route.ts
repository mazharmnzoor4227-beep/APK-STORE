import { adminDatabase, requireOwner } from '../../../../lib/admin/server';
import { callAdminUploadEdge } from '../../../../lib/admin/admin-upload-edge';

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

export async function DELETE(request: Request) {
  try {
    await requireOwner(request);
    const input = await request.json().catch(() => ({})) as { confirm?: unknown };
    if (input.confirm !== 'EMPTY TRASH') return Response.json({ error: 'Type EMPTY TRASH to confirm permanent deletion' }, { status: 400 });
    const { data: apps, error } = await adminDatabase().from('apps').select('id,title').not('deleted_at', 'is', null).order('deleted_at', { ascending: true }).limit(200);
    if (error) throw error;
    let purged = 0;
    for (const app of apps ?? []) {
      const result = await callAdminUploadEdge<{ status?: string; error?: string }>(request, 'purge-app', { id: app.id, title: app.title });
      if (!result.ok) return Response.json({ error: result.data.error || `Failed while deleting ${app.title}`, purged }, { status: result.status });
      purged++;
    }
    return Response.json({ status: 'purged', purged }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Empty trash failed';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth/i.test(message) ? 401 : 500 });
  }
}
