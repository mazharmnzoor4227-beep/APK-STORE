import { adminDatabase, requireOwner } from '../../../../../../lib/admin/server';
import { dispatchInspection } from '../../../../../../lib/admin/dispatch-inspection';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwner(request);
    const { id } = await context.params;
    const db = adminDatabase();
    const { data: candidate } = await db.from('upload_candidates').select('*').eq('id', id).eq('owner_id', ownerId).eq('status', 'uploading').single();
    if (!candidate || Date.parse(candidate.expires_at) < Date.now()) return Response.json({ error: 'Upload expired or unavailable' }, { status: 409 });
    const { data: object, error } = await db.storage.from('apk-files').info(candidate.object_key);
    if (error || !object || Number(object.size) !== Number(candidate.byte_size)) return Response.json({ error: 'Uploaded file missing or size mismatch' }, { status: 409 });
    const { error: updateError } = await db.from('upload_candidates').update({ status: 'uploaded' }).eq('id', id).eq('status', 'uploading');
    if (updateError) throw updateError;
    try {
      const queued = await dispatchInspection(id, candidate.object_key);
      if (!queued) {
        await db.from('upload_candidates').update({ error: 'Inspection service is not configured yet' }).eq('id', id).eq('owner_id', ownerId);
      }
      return Response.json({ status: 'uploaded', inspection: queued ? 'queued' : 'waiting-for-configuration' }, { status: 202 });
    } catch (error) {
      await db.from('upload_candidates').update({ error: 'Inspection could not be queued; retry from the review panel' }).eq('id', id).eq('owner_id', ownerId);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload completion failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : 500 });
  }
}
