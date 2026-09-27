import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function GET(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const { data, error } = await adminDatabase().from('upload_candidates').select('id,filename,byte_size,status,inspection,error,created_at,target_app_id').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    return Response.json({ candidates: data });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unavailable' }, { status: 401 }); }
}
