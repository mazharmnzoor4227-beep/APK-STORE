import { adminDatabase, requireOwner } from '../../../../../lib/admin/server';
import { callAdminUploadEdge } from '../../../../../lib/admin/admin-upload-edge';
import { classifyIconBytes, managedIconPath } from '../../../../../lib/admin/icon-upload';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid app' }, { status: 400 });
    const input = await request.json() as Record<string, unknown>;
    const changes: Record<string, string> = {};
    if (input.visibility !== undefined) {
      if (!['published', 'unlisted'].includes(String(input.visibility))) return Response.json({ error: 'Invalid visibility' }, { status: 400 });
      changes.visibility = String(input.visibility);
    }
    for (const [key, max] of [['title', 120], ['category', 80], ['description', 5000]] as const) {
      if (input[key] !== undefined) {
        const value = String(input[key]).trim();
        if (value.length > max || (key !== 'description' && !value)) return Response.json({ error: `Invalid ${key}` }, { status: 400 });
        changes[key] = value;
      }
    }
    if (input.iconUrl !== undefined) {
      const url = String(input.iconUrl);
      const supabaseUrl = process.env.SUPABASE_URL ?? '';
      const key = managedIconPath(url, supabaseUrl);
      if (!key) return Response.json({ error: 'Upload an icon through this panel' }, { status: 400 });
      const db = adminDatabase();
      const { data: info, error: infoError } = await db.storage.from('app-icons').info(key);
      const size = Number(info?.metadata?.size ?? info?.size ?? 0);
      if (infoError || !info || size < 1 || size > 300000)
        return Response.json({ error: 'Icon upload is missing or too large' }, { status: 400 });
      const { data: blob, error: downloadError } = await db.storage.from('app-icons').download(key);
      if (downloadError || !blob) return Response.json({ error: 'Icon upload could not be verified' }, { status: 400 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const detected = classifyIconBytes(bytes.subarray(0, 16));
      const expected = key.endsWith('.jpg') ? 'jpg' : key.endsWith('.webp') ? 'webp' : 'png';
      if (detected !== expected) {
        await db.storage.from('app-icons').remove([key]);
        return Response.json({ error: 'Uploaded file is not a valid image of the selected type' }, { status: 400 });
      }
      changes.icon_url = url;
    }
    if (!Object.keys(changes).length) return Response.json({ error: 'No changes' }, { status: 400 });
    const { data, error } = await adminDatabase().from('apps').update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id).is('deleted_at', null).select('id,visibility,title,icon_url').single();
    if (error || !data) throw error ?? new Error('App not found');
    return Response.json({ app: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Update failed' }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireOwner(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid app' }, { status: 400 });
    const input = await request.json().catch(() => ({})) as { title?: unknown };
    const title = String(input.title ?? '').trim();
    if (!title) return Response.json({ error: 'Type the exact app name to move it to Trash' }, { status: 400 });
    const result = await callAdminUploadEdge<{ status?: string; error?: string }>(request, 'delete-app', { id, title });
    return Response.json(result.data, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Delete failed';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth/i.test(message) ? 401 : 400 });
  }
}
