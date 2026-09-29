import { callAdminUploadEdge } from '../../../../../../lib/admin/admin-upload-edge';

function validId(value: string) { return /^[0-9a-f-]{36}$/i.test(value); }

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!validId(id)) return Response.json({ error: 'Invalid app' }, { status: 400 });
    const result = await callAdminUploadEdge<{ status?: string; error?: string }>(request, 'restore-app', { id });
    return Response.json(result.data, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Restore failed';
    return Response.json({ error: message }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!validId(id)) return Response.json({ error: 'Invalid app' }, { status: 400 });
    const body = await request.json().catch(() => ({})) as { title?: unknown };
    const title = String(body.title ?? '').trim();
    if (!title) return Response.json({ error: 'Type the exact app name to delete forever' }, { status: 400 });
    const result = await callAdminUploadEdge<{ status?: string; removedApks?: number; error?: string }>(request, 'purge-app', { id, title });
    return Response.json(result.data, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Permanent deletion failed';
    return Response.json({ error: message }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
}
