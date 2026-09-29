import { randomUUID } from 'node:crypto';
import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function POST(request: Request) {
  try {
    await requireOwner(request);
    const { filename, byteSize } = await request.json() as { filename?: string; byteSize?: number };
    const ext = filename?.toLowerCase().match(/\.(png|webp|jpg)$/)?.[1];
    if (!ext || !Number.isSafeInteger(byteSize) || byteSize! < 1 || byteSize! > 300000)
      return Response.json({ error: 'Choose a PNG, WebP, or JPG icon below 300 KB' }, { status: 400 });
    const path = `admin/${randomUUID()}.${ext}`;
    const db = adminDatabase();
    const { data, error } = await db.storage.from('app-icons').createSignedUploadUrl(path);
    if (error || !data) throw error ?? new Error('Could not prepare icon upload');
    return Response.json({ signedUrl: data.signedUrl, iconUrl: `${process.env.SUPABASE_URL}/storage/v1/object/public/app-icons/${path}` });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 400 });
  }
}
