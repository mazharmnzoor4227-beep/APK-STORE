import { adminDatabase, requireOwner } from '../../../../../../lib/admin/server';
import { dispatchInspection } from '../../../../../../lib/admin/dispatch-inspection';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwner(request);
    const { id } = await params;
    const db = adminDatabase();
    const { data: candidate } = await db.from('upload_candidates').select('id,object_key,status').eq('id', id).eq('owner_id', ownerId).eq('status', 'uploaded').single();
    if (!candidate) return Response.json({ error: 'Upload is not ready for inspection' }, { status: 409 });
    const queued = await dispatchInspection(candidate.id, candidate.object_key);
    if (!queued) return Response.json({ error: 'Inspection service is not configured yet' }, { status: 503 });
    await db.from('upload_candidates').update({ error: null }).eq('id', id).eq('owner_id', ownerId);
    return Response.json({ inspection: 'queued' }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inspection failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : 500 });
  }
}
