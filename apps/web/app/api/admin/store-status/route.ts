import { adminDatabase, requireOwner } from '../../../../lib/admin/server';

export async function GET(request: Request) {
  try {
    await requireOwner(request);
    const db = adminDatabase();
    const { data: identity, error: identityError } = await db.from('store_release_identity')
      .select('package_id,slug,signer_sha256,configured_at').eq('singleton', true).single();
    if (identityError) throw identityError;

    const { data: app, error: appError } = await db.from('apps')
      .select('id,slug,title,package_id,visibility,current_release_id,deleted_at,updated_at')
      .eq('package_id', identity.package_id).maybeSingle();
    if (appError) throw appError;

    let release = null;
    if (app?.current_release_id) {
      const result = await db.from('releases')
        .select('id,version_code,version_name,certificate_sha256,apk_sha256,byte_size,status,published_at')
        .eq('id', app.current_release_id).maybeSingle();
      if (result.error) throw result.error;
      release = result.data;
    }

    const { data: candidates, error: candidateError } = await db.from('upload_candidates')
      .select('id,filename,status,inspection,created_at,error')
      .in('status', ['uploaded','inspected','invalid'])
      .order('created_at', { ascending: false }).limit(100);
    if (candidateError) throw candidateError;
    const storeCandidates = (candidates ?? []).filter(candidate => candidate.inspection?.packageId === identity.package_id).slice(0, 5);

    return Response.json({ identity, app, release, candidates: storeCandidates }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Store update status unavailable';
    const status = /owner|token|sign|session|auth/i.test(message) ? 401 : 503;
    return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  }
}
