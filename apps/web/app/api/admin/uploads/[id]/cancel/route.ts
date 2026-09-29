import { requireOwner } from '../../../../../../lib/admin/server';
import { AdminUploadError, adminUploadAction } from '../../../../../../lib/admin/edge-upload';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await context.params;
    await adminUploadAction(request, 'cancel', { id });
    return Response.json({ status: 'cancelled' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cancel failed';
    const status = error instanceof AdminUploadError ? error.status : message.includes('authorization') ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
