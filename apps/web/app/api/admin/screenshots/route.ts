import { randomUUID } from 'node:crypto';
import { adminDatabase, requireOwner } from '../../../../lib/admin/server';
import { classifyScreenshotBytes } from '../../../../lib/admin/screenshot-upload';

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size < 1 || file.size > 307200)
      return Response.json({ error: 'Choose a WebP screenshot below 300 KB' }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (classifyScreenshotBytes(bytes.subarray(0, 16)) !== 'webp')
      return Response.json({ error: 'Screenshot must be a real WebP image' }, { status: 400 });
    const key = `admin/${randomUUID()}.webp`;
    const db = adminDatabase();
    const { error } = await db.storage.from('app-screenshots').upload(key, bytes, {
      contentType: 'image/webp', cacheControl: '31536000', upsert: false,
    });
    if (error) throw error;
    return Response.json({ screenshotUrl: db.storage.from('app-screenshots').getPublicUrl(key).data.publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Screenshot upload failed';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth/i.test(message) ? 401 : 400 });
  }
}
