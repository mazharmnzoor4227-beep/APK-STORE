import { requireOwner } from '../../../../lib/admin/server';
import { AdminUploadError, adminUploadAction } from '../../../../lib/admin/edge-upload';
import { createCandidateUpload } from '../../../../lib/apk/inspection';

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const input = await request.json() as { filename?: string; byteSize?: number };
    const result = await createCandidateUpload({ ownerId, filename: input.filename ?? '', byteSize: input.byteSize ?? 0 }, {
      create: async ({ filename, byteSize }) => {
        const payload = await adminUploadAction(request, 'start', { filename, byteSize });
        if (typeof payload.id !== 'string' || typeof payload.signedUrl !== 'string') throw new AdminUploadError('Upload service returned an invalid target', 502);
        return { id: payload.id, signedUrl: payload.signedUrl };
      },
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    const status = error instanceof AdminUploadError ? error.status : message.includes('authorization') ? 401 : message.includes('configured') ? 503 : 400;
    return Response.json({ error: message }, { status });
  }
}
