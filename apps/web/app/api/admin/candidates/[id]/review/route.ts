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
    const packageId = String(body.packageId || '').trim();
    const iconUrl = String(body.iconUrl || '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !title || title.length > 120 || !category || category.length > 80 || description.length > 5000 || notes.length > 5000) return Response.json({ error: 'Check the app details' }, { status: 400 });
    const { data: candidate, error: candidateError } = await db.from('upload_candidates').select('inspection').eq('id', id).eq('owner_id', ownerId).eq('status', 'inspected').single();
    if (candidateError || !candidate || packageId !== candidate.inspection?.packageId)
      return Response.json({ error: 'Package ID must match the inspected APK' }, { status: 400 });
    if (iconUrl) {
      const base = `${process.env.SUPABASE_URL}/storage/v1/object/public/app-icons/admin-icons/`;
      if (!iconUrl.startsWith(base) || !/^[-0-9a-f]{36}\.(png|webp|jpg)$/.test(iconUrl.slice(base.length)))
        return Response.json({ error: 'Upload the icon through this panel' }, { status: 400 });
      const { data: icon, error: iconError } = await db.storage.from('app-icons').info(`admin-icons/${iconUrl.slice(base.length)}`);
      if (iconError || !icon || Number(icon.metadata?.size ?? 0) > 300000)
        return Response.json({ error: 'Icon upload is missing or too large' }, { status: 400 });
    }
    const { data, error } = await db.rpc('publish_candidate', { p_candidate_id: id, p_actor_id: ownerId, p_slug: slug, p_title: title, p_category: category, p_description: description, p_release_notes: notes, p_target_app_id: body.targetAppId || null });
    if (error) throw error;
    if (iconUrl) {
      const { error: iconUpdateError } = await db.from('apps').update({ icon_url: iconUrl }).eq('id', data);
      if (iconUpdateError) return Response.json({ status: 'published', appId: data, warning: 'Release published; icon update failed. Set the icon from Manage apps.' });
    }
    return Response.json({ status: 'published', appId: data });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Review failed' }, { status: 400 }); }
}
