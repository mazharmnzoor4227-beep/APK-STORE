import { adminDatabase } from '../../../../lib/admin/server';
import { recordInspection, verifyInspectionSignature, type InspectedApk } from '../../../../lib/apk/inspection';

export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.INSPECTION_CALLBACK_SECRET;
  if (!secret || !verifyInspectionSignature(body, request.headers.get('x-apk-signature') ?? '', secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const payload = JSON.parse(body) as { candidateId: string; metadata?: InspectedApk; error?: string };
    const db = adminDatabase();
    if (payload.error) {
      const { error } = await db.from('upload_candidates').update({ status: 'invalid', error: payload.error.slice(0, 300) }).eq('id', payload.candidateId).eq('status', 'uploaded');
      if (error) throw error;
      return Response.json({ ok: true, status: 'invalid' });
    }
    if (!payload.metadata) throw new Error('Inspection metadata missing');
    await recordInspection(payload.candidateId, payload.metadata, {
      get: async id => {
        const { data } = await db.from('upload_candidates').select('*').eq('id', id).single();
        return data ? { id: data.id, expiresAt: Date.parse(data.expires_at), byteSize: Number(data.byte_size), status: data.status } : null;
      },
      record: async (id, metadata) => {
        const { error } = await db.from('upload_candidates').update({ status: 'inspected', inspection: metadata }).eq('id', id).eq('status', 'uploaded');
        if (error) throw error;
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Inspection rejected' }, { status: 400 });
  }
}
