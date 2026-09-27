import { adminDatabase, requireOwner } from '../../../../../../lib/admin/server';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwner(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid candidate' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const db = adminDatabase();
    if (action === 'reject') {
      const { error } = await db.rpc('reject_candidate', { p_candidate_id: id, p_actor_id: ownerId, p_reason: String(body.reason || 'Rejected by owner') });
      if (error) throw error;
      return Response.json({ status: 'rejected' });
    }
    if (action !== 'approve') return Response.json({ error: 'Invalid action' }, { status: 400 });
    const slug = String(body.slug || '').trim();
    const title = String(body.title || '').trim();
    const category = String(body.category || '').trim();
    const description = String(body.description || '').trim();
    const notes = String(body.releaseNotes || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || title.length > 120 || !category || category.length > 80 || description.length > 5000 || notes.length > 5000) return Response.json({ error: 'Check the app details' }, { status: 400 });
    const { data, error } = await db.rpc('publish_candidate', { p_candidate_id: id, p_actor_id: ownerId, p_slug: slug, p_title: title, p_category: category, p_description: description, p_release_notes: notes, p_target_app_id: body.targetAppId || null });
    if (error) throw error;
    return Response.json({ status: 'published', appId: data });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Review failed' }, { status: 400 }); }
}
