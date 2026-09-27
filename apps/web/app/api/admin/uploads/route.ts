import { randomUUID } from 'node:crypto';
import { adminDatabase, requireOwner } from '../../../../lib/admin/server';
import { createCandidateUpload } from '../../../../lib/apk/inspection';

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const input = await request.json() as { filename?: string; byteSize?: number };
    const db = adminDatabase();
    const result = await createCandidateUpload({ ownerId, filename: input.filename ?? '', byteSize: input.byteSize ?? 0 }, {
      create: async ({ filename, byteSize }) => {
        const id = randomUUID();
        const objectKey = `candidates/${id}.apk`;
        const { data, error } = await db.from('upload_candidates').insert({ id, owner_id: ownerId, filename, byte_size: byteSize, object_key: objectKey }).select('id').single();
        if (error || !data) throw new Error('Could not create upload');
        const signed = await db.storage.from('apk-files').createSignedUploadUrl(objectKey);
        if (signed.error || !signed.data) throw new Error('Could not prepare upload');
        return { id, signedUrl: signed.data.signedUrl };
      },
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : message.includes('configured') ? 503 : 400 });
  }
}
