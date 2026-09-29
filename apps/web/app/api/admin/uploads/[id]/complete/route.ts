import { adminDatabase, requireOwner } from '../../../../../../lib/admin/server';
import { callAdminUploadEdge } from '../../../../../../lib/admin/admin-upload-edge';
import { dispatchInspection } from '../../../../../../lib/admin/dispatch-inspection';
import { recordAdminError } from '../../../../../../lib/admin/errors';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ error: 'Invalid upload' }, { status: 400 });

    const completed = await callAdminUploadEdge<{ status?: string; error?: string }>(request, 'complete', { id });
    if (!completed.ok) return Response.json({ error: completed.data.error || 'Could not confirm upload' }, { status: completed.status });

    const db = adminDatabase();
    try {
      const queued = await dispatchInspection(id);
      if (!queued) {
        const issue = new Error('Inspection service is not configured yet');
        await db.from('upload_candidates').update({ error: issue.message }).eq('id', id).eq('owner_id', ownerId);
        await recordAdminError('api/admin/uploads/complete', issue, { candidateId: id });
      }
      return Response.json({ status: 'uploaded', inspection: queued ? 'queued' : 'waiting-for-configuration' }, { status: 202 });
    } catch (error) {
      await db.from('upload_candidates').update({ error: 'Inspection could not be queued; retry from the review panel' }).eq('id', id).eq('owner_id', ownerId);
      throw error;
    }
  } catch (error) {
    await recordAdminError('api/admin/uploads/complete', error);
    const message = error instanceof Error ? error.message : 'Upload completion failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : 500 });
  }
}
