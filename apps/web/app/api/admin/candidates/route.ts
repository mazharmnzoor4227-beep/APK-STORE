import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function GET(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const db = adminDatabase();
    const { data, error } = await db.from('upload_candidates')
      .select('id,filename,byte_size,status,inspection,error,created_at,target_app_id')
      .eq('owner_id', ownerId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const packageIds = [...new Set((data ?? []).map(candidate => candidate.inspection?.packageId).filter((value): value is string => typeof value === 'string'))];
    const { data: existingApps, error: appError } = packageIds.length
      ? await db.from('apps').select('id,package_id,slug,title,category,description,short_description,license,source_url,fdroid_url,price_type,is_recommended,screenshots,icon_url,min_sdk').in('package_id', packageIds)
      : { data: [], error: null };
    if (appError) throw appError;
    const byPackage = new Map((existingApps ?? []).map(app => [app.package_id, app]));
    return Response.json({ candidates: (data ?? []).map(candidate => ({
      ...candidate,
      existingApp: candidate.inspection?.packageId ? byPackage.get(candidate.inspection.packageId) ?? null : null,
    })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unavailable';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth|sign/i.test(message) ? 401 : 503 });
  }
}
