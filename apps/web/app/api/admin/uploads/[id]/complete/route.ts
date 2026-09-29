import { requireOwner } from '../../../../../../lib/admin/server';
import { AdminUploadError, adminUploadAction } from '../../../../../../lib/admin/edge-upload';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await context.params;
    await adminUploadAction(request, 'complete', { id });
    const inspected = await adminUploadAction(request, 'inspect', { id });
    return Response.json({ status: 'inspected', inspection: 'complete', candidate: inspected }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload completion failed';
    const status = error instanceof AdminUploadError ? error.status : message.includes('authorization') ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
