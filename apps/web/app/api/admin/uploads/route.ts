import { requireOwner } from '../../../../lib/admin/server';
import { callAdminUploadEdge } from '../../../../lib/admin/admin-upload-edge';
import { createCandidateUpload } from '../../../../lib/apk/inspection';

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const input = await request.json() as { filename?: string; byteSize?: number };
    const result = await createCandidateUpload({ ownerId, filename: input.filename ?? '', byteSize: input.byteSize ?? 0 }, {
      create: async ({ filename, byteSize }) => {
        const edge = await callAdminUploadEdge<{ id?: string; signedUrl?: string; method?: string; error?: string }>(request, 'start', { filename, byteSize });
        if (!edge.ok || !edge.data.id || !edge.data.signedUrl) throw new Error(edge.data.error || 'Could not prepare upload');
        return { id: edge.data.id, signedUrl: edge.data.signedUrl };
      },
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return Response.json({ error: message }, { status: message.includes('authorization') ? 401 : message.includes('configured') ? 503 : 400 });
  }
}
