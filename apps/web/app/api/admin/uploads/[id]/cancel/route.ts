import { requireOwner } from '../../../../../../../lib/admin/server';
import { callAdminUploadEdge } from '../../../../../../../lib/admin/admin-upload-edge';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: 'Invalid upload' }, { status: 400 });
    const cancelled = await callAdminUploadEdge<{ status?: string; error?: string }>(request, 'cancel', { id });
    return Response.json(cancelled.data, { status: cancelled.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : 500 });
  }
}
