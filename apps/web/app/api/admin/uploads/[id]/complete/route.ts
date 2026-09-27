import { adminDatabase, requireOwner } from '../../../../../../lib/admin/server';

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
    const token = process.env.GITHUB_DISPATCH_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY || 'mazharmnzoor4227-beep/APK-STORE';
    if (!token) return Response.json({ status: 'uploaded', inspection: 'waiting-for-configuration' }, { status: 202 });
    const dispatch = await fetch(`https://api.github.com/repos/${repository}/dispatches`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' }, body: JSON.stringify({ event_type: 'inspect-apk', client_payload: { candidateId: id, objectKey: candidate.object_key } }) });
    if (!dispatch.ok) throw new Error('Could not queue APK inspection');
    return Response.json({ status: 'uploaded', inspection: 'queued' }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload completion failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : 500 });
  }
}
