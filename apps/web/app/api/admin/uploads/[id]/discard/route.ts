import { requireOwner } from '../../../../../../lib/admin/server';
import { callAdminUploadEdge } from '../../../../../../lib/admin/admin-upload-edge';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid upload' }, { status: 400 });
    const discarded = await callAdminUploadEdge<{ status?: string; error?: string }>(request, 'discard', { id });
    return Response.json(discarded.data, { status: discarded.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discard failed';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth/i.test(message) ? 401 : 500 });
  }
}
