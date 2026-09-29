import { adminDatabase, requireOwner } from '../../../../../../lib/admin/server';
import { classifyIconBytes, managedIconPath } from '../../../../../../lib/admin/icon-upload';
import { classifyScreenshotBytes, managedScreenshotPath } from '../../../../../../lib/admin/screenshot-upload';
import { normalizeReviewFields } from '../../../../../../lib/admin/review-fields';
import { recordAdminError } from '../../../../../../lib/admin/errors';

async function verifyIcon(db: ReturnType<typeof adminDatabase>, url: string, inspectedUrl: string) {
  if (!url) return '';
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const publicPrefix = `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/app-icons/`;
  let key = managedIconPath(url, supabaseUrl);
  if (!key && url === inspectedUrl && url.startsWith(publicPrefix)) {
    const candidate = url.slice(publicPrefix.length);
    if (/^[0-9a-f-]{36}\.(?:png|webp|jpg)$/i.test(candidate)) key = candidate;
  }
  if (!key) throw new Error('Use the APK icon or upload the replacement through this panel');
  const { data: info, error: infoError } = await db.storage.from('app-icons').info(key);
  const size = Number(info?.metadata?.size ?? info?.size ?? 0);
  if (infoError || !info || size < 1 || size > 1048576) throw new Error('Icon upload is missing or too large');
  const { data: blob, error: downloadError } = await db.storage.from('app-icons').download(key);
  if (downloadError || !blob) throw new Error('Icon upload could not be verified');
  const detected = classifyIconBytes(new Uint8Array(await blob.arrayBuffer()).subarray(0, 16));
  const expected = key.endsWith('.jpg') ? 'jpg' : key.endsWith('.webp') ? 'webp' : 'png';
  if (detected !== expected) {
    if (managedIconPath(url, supabaseUrl)) await db.storage.from('app-icons').remove([key]);
    throw new Error('Icon content does not match its image type');
  }
  return url;
}

async function verifyScreenshots(db: ReturnType<typeof adminDatabase>, urls: unknown) {
  if (urls === undefined) return [] as string[];
  if (!Array.isArray(urls) || urls.length > 8) throw new Error('Use up to 8 screenshots');
  const supabaseUrl = process.env.SUPABASE_URL ?? '';
  const checked: string[] = [];
  for (const item of urls) {
    const url = String(item);
    const key = managedScreenshotPath(url, supabaseUrl);
    if (!key) throw new Error('Upload screenshots through this panel');
    const { data: info, error } = await db.storage.from('app-screenshots').info(key);
    const size = Number(info?.metadata?.size ?? info?.size ?? 0);
    if (error || !info || size < 1 || size > 307200) throw new Error('Screenshot is missing or too large');
    const { data: blob, error: downloadError } = await db.storage.from('app-screenshots').download(key);
    if (downloadError || !blob || classifyScreenshotBytes(new Uint8Array(await blob.arrayBuffer()).subarray(0, 16)) !== 'webp')
      throw new Error('Screenshot is not a valid WebP image');
    checked.push(url);
  }
  return checked;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ownerId = await requireOwner(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: 'Invalid candidate' }, { status: 400 });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const db = adminDatabase();
    if (action === 'reject') {
      const { error } = await db.rpc('reject_candidate', { p_candidate_id: id, p_actor_id: ownerId, p_reason: String(body.reason || 'Rejected by owner') });
      if (error) throw error;
      return Response.json({ status: 'rejected' });
    }
    if (!['approve','draft'].includes(action)) return Response.json({ error: 'Invalid action' }, { status: 400 });

    const { data: candidate, error: candidateError } = await db.from('upload_candidates')
      .select('inspection,target_app_id').eq('id', id).eq('owner_id', ownerId).eq('status', 'inspected').single();
    if (candidateError || !candidate?.inspection) return Response.json({ error: 'Candidate is not ready for review' }, { status: 409 });
    const packageId = String(body.packageId || '').trim();
    if (packageId !== candidate.inspection.packageId)
      return Response.json({ error: 'Package ID must match the inspected APK' }, { status: 400 });

    const fields = normalizeReviewFields(body);
    const inspectedIcon = String(candidate.inspection.iconUrl ?? '');
    const requestedIcon = String(body.iconUrl || inspectedIcon || '').trim();
    if (!requestedIcon) return Response.json({ error: 'A verified launcher icon is required' }, { status: 400 });
    const iconUrl = await verifyIcon(db, requestedIcon, inspectedIcon);
    const screenshots = await verifyScreenshots(db, body.screenshots);

    if (action === 'draft') {
      const inspection = { ...candidate.inspection, draft: { ...fields, packageId, iconUrl, screenshots } };
      const { error } = await db.from('upload_candidates').update({ inspection, error: null }).eq('id', id).eq('owner_id', ownerId).eq('status', 'inspected');
      if (error) throw error;
      return Response.json({ status: 'draft-saved' });
    }

    const { data: appId, error } = await db.rpc('publish_candidate', {
      p_candidate_id: id, p_actor_id: ownerId, p_slug: fields.slug, p_title: fields.title,
      p_category: fields.category, p_description: fields.description, p_release_notes: fields.releaseNotes,
      p_target_app_id: body.targetAppId || candidate.target_app_id || null,
    });
    if (error) throw error;
    const extras: Record<string, unknown> = {
      icon_url: iconUrl, screenshots, short_description: fields.shortDescription, license: fields.license,
      source_url: fields.sourceUrl, fdroid_url: fields.fdroidUrl, price_type: fields.priceType,
      is_recommended: fields.recommended, updated_at: new Date().toISOString(),
    };
    const minSdk = Number(candidate.inspection.minSdk);
    if (Number.isSafeInteger(minSdk) && minSdk > 0) extras.min_sdk = minSdk;
    const { error: updateError } = await db.from('apps').update(extras).eq('id', appId);
    if (updateError) {
      await recordAdminError('api/admin/candidates/review-metadata', updateError, { candidateId: id, appId });
      return Response.json({ status: 'published', appId, warning: `Release published; catalog metadata update failed: ${updateError.message}` });
    }
    return Response.json({ status: 'published', appId });
  } catch (error) {
    await recordAdminError('api/admin/candidates/review', error);
    const message = error instanceof Error ? error.message : 'Review failed';
    return Response.json({ error: message }, { status: /owner|authorization|token|auth/i.test(message) ? 401 : 400 });
  }
}
