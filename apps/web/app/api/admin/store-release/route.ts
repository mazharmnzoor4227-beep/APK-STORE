import { adminDatabase, requireOwner } from '../../../../lib/admin/server';
import { validateStoreRelease } from '../../../../lib/admin/store-release-policy';
import { recordAdminError } from '../../../../lib/admin/errors';

export async function POST(request: Request) {
  try {
    const ownerId = await requireOwner(request);
    const body = await request.json() as { candidateId?: unknown; releaseNotes?: unknown };
    const candidateId = String(body.candidateId ?? '');
    if (!/^[0-9a-f-]{36}$/i.test(candidateId)) return Response.json({ error: 'Choose an inspected APK STORE upload' }, { status: 400 });
    const releaseNotes = String(body.releaseNotes ?? '').trim();
    if (releaseNotes.length > 5000) return Response.json({ error: 'Release notes are too long' }, { status: 400 });

    const db = adminDatabase();
    const { data: identity, error: identityError } = await db.from('store_release_identity')
      .select('package_id,slug,signer_sha256').eq('singleton', true).single();
    if (identityError || !identity) throw identityError ?? new Error('Store release identity is missing');
    const { data: candidate, error: candidateError } = await db.from('upload_candidates')
      .select('id,status,inspection,owner_id').eq('id', candidateId).eq('owner_id', ownerId).single();
    if (candidateError || candidate?.status !== 'inspected' || !candidate.inspection)
      return Response.json({ error: 'APK STORE upload must finish inspection first' }, { status: 409 });
    const { data: app, error: appError } = await db.from('apps')
      .select('id,title,category,description,current_release_id,deleted_at').eq('package_id', identity.package_id).maybeSingle();
    if (appError) throw appError;
    let currentVersionCode = 0;
    if (app?.current_release_id) {
      const { data: release, error } = await db.from('releases').select('version_code').eq('id', app.current_release_id).maybeSingle();
      if (error) throw error;
      currentVersionCode = Number(release?.version_code ?? 0);
    }
    const violation = validateStoreRelease(candidate.inspection, {
      packageId: identity.package_id, signerSha256: identity.signer_sha256, currentVersionCode,
    });
    if (violation) return Response.json({ error: violation }, { status: 400 });

    const { data: appId, error: publishError } = await db.rpc('publish_candidate', {
      p_candidate_id: candidateId, p_actor_id: ownerId, p_slug: identity.slug,
      p_title: app?.title || 'APK STORE', p_category: app?.category || 'Installer & app stores',
      p_description: app?.description || 'APK STORE Android client.', p_release_notes: releaseNotes,
      p_target_app_id: app?.id || null,
    });
    if (publishError) throw publishError;
    const iconUrl = String(candidate.inspection.iconUrl ?? '');
    const extras: Record<string, unknown> = { visibility: 'published', deleted_at: null, updated_at: new Date().toISOString() };
    if (iconUrl.startsWith(`${process.env.SUPABASE_URL}/storage/v1/object/public/app-icons/`)) extras.icon_url = iconUrl;
    const minSdk = Number(candidate.inspection.minSdk);
    if (Number.isSafeInteger(minSdk) && minSdk > 0) extras.min_sdk = minSdk;
    const { error: updateError } = await db.from('apps').update(extras).eq('id', appId);
    if (updateError) throw updateError;
    const { error: auditError } = await db.from('admin_audit').insert({
      actor_id: ownerId, action: 'publish-store-release', subject_id: appId, subject_name: 'APK STORE',
      details: { candidateId, versionCode: candidate.inspection.versionCode },
    });
    if (auditError) throw auditError;
    return Response.json({ status: 'published', appId, versionCode: candidate.inspection.versionCode });
  } catch (error) {
    await recordAdminError('api/admin/store-release', error);
    const message = error instanceof Error ? error.message : 'APK STORE release publish failed';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth/i.test(message) ? 401 : 400 });
  }
}
