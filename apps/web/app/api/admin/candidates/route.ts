import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function GET(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const { data, error } = await adminDatabase().from('upload_candidates').select('id,filename,byte_size,status,inspection,error,created_at,target_app_id').eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const packageIds = [...new Set((data ?? []).map(candidate => candidate.inspection?.packageId).filter((value): value is string => typeof value === 'string'))];
    const { data: existingApps, error: appError } = packageIds.length
      ? await adminDatabase().from('apps').select('id,package_id,slug,title,category,description').in('package_id', packageIds)
      : { data: [], error: null };
    if (appError) throw appError;
    const byPackage = new Map((existingApps ?? []).map(app => [app.package_id, app]));
    return Response.json({ candidates: (data ?? []).map(candidate => ({
      ...candidate,
      existingApp: candidate.inspection?.packageId ? byPackage.get(candidate.inspection.packageId) ?? null : null,
    })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unavailable' }, { status: 401 }); }
}
