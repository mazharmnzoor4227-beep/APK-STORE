import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from 'npm:@aws-sdk/client-s3@3.901.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.901.0';
import { parseApkFile, parseApkUrl } from 'npm:simple-apk-parser@0.1.2';
import { createHash } from 'node:crypto';
import { hasRequiredIcon, managedMediaPath } from './inspection-policy.mjs';

const allowedOrigins = [
  'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site',
  'https://mazharmnzoor4227-beep.github.io',
];
const headers = { 'Access-Control-Allow-Origin': allowedOrigins[0], 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
const ownerEmail = 'mazharmanzoor4117@gmail.com';
const maxApkSize = 700 * 1024 * 1024;
const smallLimit = 50 * 1024 * 1024;
const r2Bucket = Deno.env.get('R2_BUCKET');
const r2 = Deno.env.get('R2_ACCOUNT_ID') && Deno.env.get('R2_ACCESS_KEY_ID') && Deno.env.get('R2_SECRET_ACCESS_KEY') && r2Bucket
  ? new S3Client({ region: 'auto', endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials: { accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')! } }) : null;
let activeHeaders: Record<string, string> = headers;
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: activeHeaders }); }

// Catalog version bump: the website caches the catalog (stale-while-revalidate)
// and only re-downloads it when site_settings -> catalog_version changes.
// Called after publish / manage-app / delete-app. Best-effort: a failed bump
// must never break the admin action itself.
async function bumpCatalogVersion() {
  try {
    const { error } = await db.from('site_settings')
      .upsert({ key: 'catalog_version', value: { v: Date.now() }, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) console.warn('catalog version bump failed:', error.message);
  } catch (e) { console.warn('catalog version bump failed:', e instanceof Error ? e.message : e); }
}

// Multipart helper for R2 large uploads. The browser uploads parts directly to
// R2 via presigned UploadPart URLs; the server only assembles them. Used for
// APKs > 50 MB, where a single PUT of several hundred MB is unreliable
// (Cloudflare R2 occasionally answers 500 on very large single PUTs).
async function mpLoad(id: unknown, userId: string) {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return { err: json({ error: 'Invalid upload' }, 400) };
  const { data: c } = await db.from('upload_candidates')
    .select('object_key,byte_size,status,expires_at,inspection')
    .eq('id', id).eq('owner_id', userId).maybeSingle();
  if (!c || c.status !== 'uploading') return { err: json({ error: 'Upload is not ready' }, 409) };
  if (Date.parse(c.expires_at) < Date.now()) return { err: json({ error: 'Upload expired' }, 409) };
  if (!String(c.object_key).startsWith('r2/')) return { err: json({ error: 'Multipart is for large uploads only' }, 400) };
  if (!r2) return { err: json({ error: 'Large APK storage unavailable' }, 503) };
  return { c, insp: ((c.inspection as Record<string, unknown>) || {}) };
}

Deno.serve(async (request) => {
  const reqOrigin = request.headers.get('origin') || '';
  const corsHeaders = { ...headers, 'Access-Control-Allow-Origin': allowedOrigins.includes(reqOrigin) ? reqOrigin : allowedOrigins[0] };
  activeHeaders = corsHeaders;
  if (!allowedOrigins.includes(reqOrigin)) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json({ error: 'Sign in required' }, 401);
  const { data: { user }, error: userError } = await auth.auth.getUser(token);
  if (userError || !user?.email_confirmed_at || user.email?.toLowerCase() !== ownerEmail) return json({ error: 'Owner access required' }, 403);

  let inspecting = '';
  try {
    const route = new URL(request.url).searchParams.get('action') || '';
    if (request.method === 'GET' && route === 'list') {
      const { data, error } = await db.from('upload_candidates').select('id,filename,byte_size,status,error,inspection,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(30);
      if (error) throw error;
      return json({ candidates: data });
    }
    if (request.method === 'POST' && route === 'start') {
      const input = await request.json();
      const filename = String(input.filename || '');
      const byteSize = Number(input.byteSize);
      if (!/^[^/\\]{1,160}\.apk$/i.test(filename) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > maxApkSize)
        return json({ error: 'Select an APK up to 700 MB' }, 400);
      if (byteSize > smallLimit && !r2) return json({ error: 'Large APK storage is not configured yet.' }, 503);
      const id = crypto.randomUUID();
      const objectKey = byteSize > smallLimit ? `r2/pending/${user.id}/${id}.apk` : `pending/${user.id}/${id}.apk`;
      const { error: insertError } = await db.from('upload_candidates').insert({ id, owner_id: user.id, filename, byte_size: byteSize, object_key: objectKey });
      if (insertError) throw insertError;
      try {
        if (byteSize > smallLimit) {
          const signedUrl = await getSignedUrl(r2!, new PutObjectCommand({ Bucket: r2Bucket!, Key: objectKey, ContentType: 'application/vnd.android.package-archive' }), { expiresIn: 3600 });
          return json({ id, signedUrl, method: 'PUT' });
        }
        const { data: signed, error: signedError } = await db.storage.from('apk-files').createSignedUploadUrl(objectKey);
        if (signedError || !signed) throw signedError || new Error('Upload could not be prepared');
        return json({ id, signedUrl: signed.signedUrl, method: 'PUT' });
      } catch (signedError) {
        await db.from('upload_candidates').delete().eq('id', id).eq('owner_id', user.id);
        throw signedError;
      }
    }
    // --- R2 multipart upload for large APKs (> 50 MB) ---
    // Permanent fix for unreliable single-PUT uploads of multi-hundred-MB
    // files: the browser uploads 16 MiB parts with per-part retry; the server
    // only assembles them. Part PUTs must NOT send Content-Type — the part
    // URLs are signed without it.
    if (request.method === 'POST' && route === 'mp-start') {
      const { id } = await request.json();
      const loaded = await mpLoad(id, user.id);
      if ('err' in loaded) return loaded.err;
      const { c, insp } = loaded;
      // Abort any previous orphaned multipart upload for this candidate.
      if (typeof insp.mpUploadId === 'string' && insp.mpUploadId) {
        await r2!.send(new AbortMultipartUploadCommand({ Bucket: r2Bucket!, Key: c.object_key, UploadId: insp.mpUploadId })).catch(() => {});
      }
      const out = await r2!.send(new CreateMultipartUploadCommand({ Bucket: r2Bucket!, Key: c.object_key, ContentType: 'application/vnd.android.package-archive' }));
      if (!out.UploadId) throw new Error('Could not start multipart upload');
      const { error } = await db.from('upload_candidates')
        .update({ inspection: { ...insp, mpUploadId: out.UploadId } })
        .eq('id', id).eq('owner_id', user.id).eq('status', 'uploading');
      if (error) throw error;
      return json({ uploadId: out.UploadId });
    }
    if (request.method === 'POST' && route === 'mp-part-url') {
      const { id, partNumber } = await request.json();
      const pn = Number(partNumber);
      if (!Number.isSafeInteger(pn) || pn < 1 || pn > 10000) return json({ error: 'Invalid part number' }, 400);
      const loaded = await mpLoad(id, user.id);
      if ('err' in loaded) return loaded.err;
      const { c, insp } = loaded;
      const uploadId = typeof insp.mpUploadId === 'string' && insp.mpUploadId ? insp.mpUploadId : null;
      if (!uploadId) return json({ error: 'Multipart upload not started' }, 409);
      const signedUrl = await getSignedUrl(r2!, new UploadPartCommand({ Bucket: r2Bucket!, Key: c.object_key, UploadId: uploadId, PartNumber: pn }), { expiresIn: 900 });
      return json({ signedUrl, partNumber: pn });
    }
    if (request.method === 'POST' && route === 'mp-complete') {
      const { id, parts, sha256 } = await request.json();
      let clientSha256: string | null = null;
      if (sha256 !== undefined) {
        if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return json({ error: 'Invalid checksum' }, 400);
        clientSha256 = sha256;
      }
      if (!Array.isArray(parts) || parts.length < 1 || parts.length > 10000) return json({ error: 'Invalid parts' }, 400);
      const norm: { partNumber: number; etag: string }[] = [];
      for (const p of parts) {
        const pn = Number(p && p.partNumber);
        const etag = String(p && p.etag || '');
        if (!Number.isSafeInteger(pn) || pn < 1 || pn > 10000 || etag.length < 3 || etag.length > 256) return json({ error: 'Invalid parts' }, 400);
        norm.push({ partNumber: pn, etag });
      }
      norm.sort((a, b) => a.partNumber - b.partNumber);
      for (let i = 1; i < norm.length; i++) if (norm[i].partNumber === norm[i - 1].partNumber) return json({ error: 'Duplicate part' }, 400);
      const loaded = await mpLoad(id, user.id);
      if ('err' in loaded) return loaded.err;
      const { c, insp } = loaded;
      const uploadId = typeof insp.mpUploadId === 'string' && insp.mpUploadId ? insp.mpUploadId : null;
      if (!uploadId) return json({ error: 'Multipart upload not started' }, 409);
      await r2!.send(new CompleteMultipartUploadCommand({
        Bucket: r2Bucket!, Key: c.object_key, UploadId: uploadId,
        MultipartUpload: { Parts: norm.map(p => ({ PartNumber: p.partNumber, ETag: p.etag })) },
      }));
      const object = await r2!.send(new HeadObjectCommand({ Bucket: r2Bucket!, Key: c.object_key })).catch(() => null);
      if (!object || Number(object.ContentLength) !== Number(c.byte_size)) {
        await r2!.send(new DeleteObjectCommand({ Bucket: r2Bucket!, Key: c.object_key })).catch(() => {});
        return json({ error: 'Assembled file size mismatch' }, 409);
      }
      const { error } = await db.from('upload_candidates')
        .update({ status: 'uploaded', inspection: { ...insp, ...(clientSha256 ? { clientSha256 } : {}), mpUploadId: null } })
        .eq('id', id).eq('owner_id', user.id).eq('status', 'uploading');
      if (error) throw error;
      return json({ status: 'uploaded' });
    }
    if (request.method === 'POST' && route === 'mp-abort') {
      // Best-effort cleanup after a failed or cancelled multipart upload.
      try {
        const { id } = await request.json();
        if (typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id)) {
          const { data: c } = await db.from('upload_candidates')
            .select('object_key,inspection').eq('id', id).eq('owner_id', user.id).maybeSingle();
          const insp = ((c && c.inspection) as Record<string, unknown>) || {};
          if (c && r2 && typeof insp.mpUploadId === 'string' && insp.mpUploadId) {
            await r2.send(new AbortMultipartUploadCommand({ Bucket: r2Bucket!, Key: c.object_key, UploadId: insp.mpUploadId })).catch(() => {});
          }
          if (c) await db.from('upload_candidates').delete().eq('id', id).eq('owner_id', user.id);
        }
      } catch { /* best effort */ }
      return json({ aborted: true });
    }
    if (request.method === 'POST' && route === 'complete') {
      const { id, sha256 } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
      // Browser-computed SHA-256 of the uploaded file. Required context for large
      // (R2) uploads: the inspect step trusts it instead of re-downloading +
      // re-hashing the file, which exceeds the function CPU budget (HTTP 546).
      let clientSha256: string | null = null;
      if (sha256 !== undefined) {
        if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return json({ error: 'Invalid checksum' }, 400);
        clientSha256 = sha256;
      }
      const { data: candidate } = await db.from('upload_candidates').select('object_key,byte_size,expires_at').eq('id', id).eq('owner_id', user.id).eq('status', 'uploading').maybeSingle();
      if (!candidate || Date.parse(candidate.expires_at) < Date.now()) return json({ error: 'Upload expired' }, 409);
      if (candidate.object_key.startsWith('r2/')) {
        if (!r2) return json({ error: 'Large APK storage unavailable' }, 503);
        const object = await r2.send(new HeadObjectCommand({ Bucket: r2Bucket!, Key: candidate.object_key })).catch(() => null);
        if (!object || Number(object.ContentLength) !== Number(candidate.byte_size)) return json({ error: 'File missing or size mismatch' }, 409);
      } else {
        const { data: object } = await db.storage.from('apk-files').info(candidate.object_key);
        if (!object || Number(object.size) !== Number(candidate.byte_size)) return json({ error: 'File missing or size mismatch' }, 409);
      }
      const patch: Record<string, unknown> = { status: 'uploaded' };
      if (clientSha256) patch.inspection = { clientSha256 };
      const { error } = await db.from('upload_candidates').update(patch).eq('id', id).eq('owner_id', user.id).eq('status', 'uploading');
      if (error) throw error;
      return json({ status: 'uploaded' });
    }
    if (request.method === 'POST' && route === 'inspect') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
      inspecting = id;
      const { data: candidate } = await db.from('upload_candidates').select('*').eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded').maybeSingle();
      if (!candidate) return json({ error: 'Upload is not ready for inspection' }, 409);
      let signedUrl: string;
      if (candidate.object_key.startsWith('r2/')) {
        if (!r2) return json({ error: 'Large APK storage unavailable' }, 503);
        signedUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: r2Bucket!, Key: candidate.object_key }), { expiresIn: 900 });
      } else {
        const { data, error } = await db.storage.from('apk-files').createSignedUrl(candidate.object_key, 900);
        if (error || !data) throw error || new Error('File unavailable');
        signedUrl = data.signedUrl;
      }
      // Supabase Storage does not need HTTP Range for smaller uploads. R2 Range
      // keeps metadata parsing within the Edge Function memory budget.
      const parsed = candidate.object_key.startsWith('r2/')
        ? await parseApkUrl(signedUrl, { locale: 'en-US' })
        : await parseApkFile(await (await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) })).blob(), { locale: 'en-US' });
      const certificates = parsed.signatures.filter((s: { found: boolean; certificate?: { sha256?: string } }) => s.found && s.certificate?.sha256).map((s: { certificate: { sha256: string } }) => s.certificate.sha256.toLowerCase());
      if (!parsed.packageName || !Number.isSafeInteger(parsed.versionCode) || parsed.versionCode <= 0 || !certificates.length || new Set(certificates).size !== 1)
        return json({ error: 'APK package, version or signer could not be verified' }, 422);
      const isR2 = candidate.object_key.startsWith('r2/');
      const clientSha256 = candidate.inspection && typeof candidate.inspection === 'object'
        ? (candidate.inspection as Record<string, unknown>).clientSha256 : null;
      let apkSha256: string;
      if (isR2) {
        // Large file: trust the browser-computed checksum stored at complete time.
        // Re-downloading + re-hashing a multi-hundred-MB file here blows the
        // function CPU budget and the platform answers HTTP 546.
        if (typeof clientSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(clientSha256))
          return json({ error: 'Checksum missing — refresh the admin panel and upload again' }, 400);
        const head = await r2!.send(new HeadObjectCommand({ Bucket: r2Bucket!, Key: candidate.object_key })).catch(() => null);
        if (!head || Number(head.ContentLength) !== Number(candidate.byte_size))
          return json({ error: 'APK size changed after upload' }, 409);
        apkSha256 = clientSha256;
      } else {
        const download = await fetch(signedUrl, { signal: AbortSignal.timeout(30_000) });
        if (!download.ok || !download.body) throw new Error('APK could not be read for checksum');
        const hash = createHash('sha256'); let bytes = 0;
        for await (const chunk of download.body) { bytes += chunk.byteLength; if (bytes > maxApkSize) throw new Error('APK exceeds size limit'); hash.update(chunk); }
        if (bytes !== Number(candidate.byte_size)) return json({ error: 'APK size changed after upload' }, 409);
        apkSha256 = hash.digest('hex');
      }
      const metadata = parsed as typeof parsed & { minSdkVersion?: number; targetSdkVersion?: number; minSdk?: number; targetSdk?: number; permissions?: string[]; abis?: string[] };
      const inspection = { packageId: parsed.packageName, versionCode: parsed.versionCode, versionName: parsed.versionName || String(parsed.versionCode), certificateSha256: certificates[0], apkSha256, appName: String(parsed.appName || parsed.packageName).slice(0, 100), minSdk: metadata.minSdkVersion || metadata.minSdk || null, targetSdk: metadata.targetSdkVersion || metadata.targetSdk || null, permissions: Array.isArray(metadata.permissions) ? metadata.permissions.slice(0, 300) : [], abis: Array.isArray(metadata.abis) ? metadata.abis.slice(0, 20) : [] };
      if (parsed.iconBlob && parsed.iconBlob.size <= 1048576 && ['image/png','image/jpeg','image/webp'].includes(parsed.iconBlob.type)) {
        const iconKey = `${id}.${parsed.iconBlob.type.split('/')[1] === 'jpeg' ? 'jpg' : parsed.iconBlob.type.split('/')[1]}`;
        const { error } = await db.storage.from('app-icons').upload(iconKey, parsed.iconBlob, { contentType: parsed.iconBlob.type, upsert: true });
        if (!error) Object.assign(inspection, { iconUrl: db.storage.from('app-icons').getPublicUrl(iconKey).data.publicUrl });
      }
      if (!hasRequiredIcon(inspection)) {
        const reason = 'APK launcher icon could not be extracted. Upload a valid APK with a launcher icon or use the owner icon replacement flow before publishing.';
        await db.from('upload_candidates').update({ error: reason }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded');
        return json({ error: reason }, 422);
      }
      const { error } = await db.from('upload_candidates').update({ status: 'inspected', inspection, error: null }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded');
      if (error) throw error;
      // Tells the admin panel (v4+) that publish accepts manual versionName/versionCode/minSdk overrides.
      return json({ inspection, supportsManualVersion: true });
    }
    if (request.method === 'POST' && route === 'discard') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
      const { data: candidate } = await db.from('upload_candidates').select('object_key,status,filename').eq('id', id).eq('owner_id', user.id).maybeSingle();
      if (!candidate || !['uploaded','inspected'].includes(candidate.status)) return json({ error: 'Upload cannot be discarded now' }, 409);
      await removeApk(candidate.object_key);
      const { error } = await db.rpc('reject_candidate', { p_candidate_id: id, p_actor_id: user.id, p_reason: 'Discarded by owner' });
      if (error) throw error;
      await db.from('admin_audit').insert({ actor_id: user.id, action: 'discard', subject_id: id, subject_name: candidate.filename });
      return json({ status: 'rejected' });
    }
    if (request.method === 'POST' && route === 'cancel') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
      const { data: candidate } = await db.from('upload_candidates').select('object_key').eq('id', id).eq('owner_id', user.id).eq('status', 'uploading').maybeSingle();
      if (!candidate) return json({ error: 'Upload is no longer active' }, 409);
      await removeApk(candidate.object_key);
      const { error } = await db.from('upload_candidates').update({ status: 'rejected', error: 'Cancelled by owner' }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploading');
      if (error) throw error;
      return json({ status: 'cancelled' });
    }
    if (request.method === 'POST' && route === 'publish') {
      const input = await request.json();
      if (input.rightsConfirmed !== true) return json({ error: 'Confirm you have the right to distribute this app' }, 400);
      if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/.test(input.id)) return json({ error: 'Invalid upload' }, 400);
      const targetAppId = typeof input.targetAppId === 'string' && /^[0-9a-f-]{36}$/.test(input.targetAppId) ? input.targetAppId : null;
      const { data: candidate } = await db.from('upload_candidates').select('inspection,status').eq('id', input.id).eq('owner_id', user.id).maybeSingle();
      if (candidate?.status !== 'inspected') return json({ error: 'Inspect the APK first' }, 409);
      // Owner manual overrides for auto-detected metadata (admin panel v4).
      // They are written back into the candidate inspection so publish_candidate,
      // min_sdk and the audit trail all use the overridden values. The RPC still
      // enforces package match, certificate match and increasing version code.
      const ovr: Record<string, unknown> = {};
      if (input.versionName !== undefined) {
        const vn = String(input.versionName).trim().slice(0, 64);
        if (!vn) return json({ error: 'Invalid version name override' }, 400);
        ovr.versionName = vn;
      }
      if (input.versionCode !== undefined) {
        const vc = Number(input.versionCode);
        if (!Number.isSafeInteger(vc) || vc <= 0) return json({ error: 'Invalid version code override' }, 400);
        ovr.versionCode = vc;
      }
      if (input.minSdk !== undefined && input.minSdk !== null) {
        const ms = Number(input.minSdk);
        if (!Number.isSafeInteger(ms) || ms < 1 || ms > 40) return json({ error: 'Invalid min SDK override' }, 400);
        ovr.minSdk = ms;
      }
      if (Object.keys(ovr).length) {
        const newInspection = { ...(candidate.inspection as Record<string, unknown>), ...ovr };
        const { error: ovrError } = await db.from('upload_candidates').update({ inspection: newInspection }).eq('id', input.id).eq('owner_id', user.id).eq('status', 'inspected');
        if (ovrError) throw ovrError;
        (candidate as { inspection: unknown }).inspection = newInspection;
      }
      const title = String(input.title || '').trim().slice(0, 100);
      const category = String(input.category || 'Tools').trim().slice(0, 60);
      const description = String(input.description || '').trim().slice(0, 2000);
      const releaseNotes = String(input.releaseNotes || '').trim().slice(0, 1000);
      let slug = String(input.slug || candidate.inspection.packageId.replaceAll('.', '-')).toLowerCase();
      if (targetAppId) {
        const { data: target } = await db.from('apps').select('slug').eq('id', targetAppId).maybeSingle();
        if (!target) return json({ error: 'Target app not found' }, 404);
        slug = target.slug;
      }
      if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: 'Enter a valid app name' }, 400);
      const sourceUrl = input.sourceUrl !== undefined ? validUrl(input.sourceUrl) : undefined;
      const fdroidUrl = input.fdroidUrl !== undefined ? validUrl(input.fdroidUrl) : undefined;
      const { data: appId, error } = await db.rpc('publish_candidate', { p_candidate_id: input.id, p_actor_id: user.id, p_slug: slug, p_title: title, p_category: category, p_description: description, p_release_notes: releaseNotes, p_target_app_id: targetAppId });
      if (error) throw error;
      const extras: Record<string, unknown> = { short_description: String(input.shortDescription || '').trim().slice(0, 80), is_recommended: input.recommended === true };
      if (candidate.inspection.iconUrl) extras.icon_url = candidate.inspection.iconUrl;
      if (Number.isInteger(candidate.inspection.minSdk) && candidate.inspection.minSdk > 0) extras.min_sdk = candidate.inspection.minSdk;
      if (input.license !== undefined) extras.license = String(input.license).trim().slice(0, 80);
      if (input.priceType !== undefined && ['Free','In-app purchases','In-app purchases or Paid'].includes(input.priceType)) extras.price_type = input.priceType;
      if (sourceUrl !== undefined) extras.source_url = sourceUrl;
      if (fdroidUrl !== undefined) extras.fdroid_url = fdroidUrl;
      const { error: updateError } = await db.from('apps').update(extras).eq('id', appId);
      if (updateError) throw updateError;
      const { error: auditError } = await db.from('admin_audit').insert({ actor_id: user.id, action: 'publish', subject_id: appId, subject_name: title, details: { rightsConfirmed: true, packageId: candidate.inspection.packageId, manualOverride: Object.keys(ovr).length ? ovr : undefined } });
      if (auditError) throw new Error('App published, but audit record failed: '+auditError.message);
      await bumpCatalogVersion();
      return json({ appId, slug });
    }
    if (request.method === 'GET' && route === 'apps') {
      const { data, error } = await db.from('apps').select('id,slug,title,package_id,category,description,short_description,icon_url,visibility,current_release_id,updated_at,screenshots,license,source_url,fdroid_url,price_type,is_recommended,min_sdk,deleted_at').order('updated_at', { ascending: false }).limit(200);
      if (error) throw error;
      const ids = (data || []).map(app => app.current_release_id).filter(Boolean);
      const { data: releases, error: releaseError } = ids.length
        ? await db.from('releases').select('id,version_code,version_name,status,byte_size,certificate_sha256,apk_sha256,release_notes').in('id', ids)
        : { data: [], error: null };
      if (releaseError) throw releaseError;
      const byId = new Map((releases || []).map(release => [release.id, release]));
      return json({ apps: (data || []).map(app => ({ ...app, release: byId.get(app.current_release_id) || null })) });
    }
    if (request.method === 'POST' && route === 'icon-start') {
      const input = await request.json();
      const ext = String(input.filename || '').toLowerCase().match(/\.(png|jpg|webp)$/)?.[1];
      const byteSize = Number(input.byteSize);
      if (!ext || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 300000)
        return json({ error: 'Use a PNG, JPG or WebP icon below 300 KB' }, 400);
      const objectKey = 'admin/' + crypto.randomUUID() + '.' + ext;
      const { data, error } = await db.storage.from('app-icons').createSignedUploadUrl(objectKey);
      if (error || !data) throw error || new Error('Icon upload unavailable');
      return json({ signedUrl: data.signedUrl, iconUrl: db.storage.from('app-icons').getPublicUrl(objectKey).data.publicUrl });
    }
    if (request.method === 'POST' && route === 'screenshot-start') {
      const { byteSize } = await request.json();
      if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 307200) return json({ error: 'Screenshot must be a WebP under 300 KB' }, 400);
      const objectKey = 'admin/' + crypto.randomUUID() + '.webp';
      const { data, error } = await db.storage.from('app-screenshots').createSignedUploadUrl(objectKey);
      if (error || !data) throw error || new Error('Screenshot upload unavailable');
      return json({ signedUrl: data.signedUrl, screenshotUrl: db.storage.from('app-screenshots').getPublicUrl(objectKey).data.publicUrl });
    }
    if (request.method === 'POST' && route === 'manage-app') {
      const input = await request.json();
      const id = String(input.id || '');
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid app' }, 400);
      const { data: app } = await db.from('apps').select('id,current_release_id,deleted_at,screenshots').eq('id', id).maybeSingle();
      if (!app) return json({ error: 'App not found' }, 404);
      if (app.deleted_at) return json({ error: 'Restore this app before editing or republishing it' }, 409);
      const changes: Record<string, unknown> = {};
      if (input.visibility !== undefined) {
        if (!['published','unlisted'].includes(input.visibility) || (input.visibility === 'published' && !app.current_release_id))
          return json({ error: 'Only approved releases can be published' }, 400);
        changes.visibility = input.visibility;
      }
      for (const [field, maximum] of [['title',120],['category',80],['description',5000],['short_description',80],['license',80]] as const) {
        if (input[field] !== undefined) {
          const value = String(input[field]).trim();
          if (value.length > maximum || (['title','category'].includes(field) && !value)) return json({ error: 'Invalid ' + field }, 400);
          changes[field] = value;
        }
      }
      for (const field of ['source_url','fdroid_url'] as const) if (input[field] !== undefined) changes[field] = validUrl(input[field]);
      if (input.is_recommended !== undefined) changes.is_recommended = input.is_recommended === true;
      if (input.price_type !== undefined) {
        if (!['Free','In-app purchases','In-app purchases or Paid'].includes(input.price_type)) return json({ error: 'Invalid price type' }, 400);
        changes.price_type = input.price_type;
      }
      if (input.screenshots !== undefined) {
        if (!Array.isArray(input.screenshots) || input.screenshots.length > 8) return json({ error: 'Use up to 8 screenshots' }, 400);
        const prefix = db.storage.from('app-screenshots').getPublicUrl('admin/').data.publicUrl;
        const urls = input.screenshots.map(String);
        for (const url of urls) {
          if (app.screenshots?.includes(url)) continue;
          const name = url.startsWith(prefix) ? url.slice(prefix.length) : '';
          if (!/^[0-9a-f-]{36}\.webp$/.test(name)) return json({ error: 'Upload each screenshot in this panel first' }, 400);
          const { data: object } = await db.storage.from('app-screenshots').info('admin/' + name);
          if (!object || Number(object.size) > 307200) return json({ error: 'Screenshot missing or too large' }, 400);
        }
        changes.screenshots = urls;
      }
      if (input.iconUrl !== undefined) {
        const prefix = db.storage.from('app-icons').getPublicUrl('admin/').data.publicUrl;
        const iconUrl = String(input.iconUrl);
        const name = iconUrl.startsWith(prefix) ? iconUrl.slice(prefix.length) : '';
        if (!/^[0-9a-f-]{36}\.(png|jpg|webp)$/.test(name)) return json({ error: 'Upload icon in this panel first' }, 400);
        const { data: icon, error } = await db.storage.from('app-icons').info('admin/' + name);
        if (error || !icon || Number(icon.size) > 300000) return json({ error: 'Icon missing or too large' }, 400);
        changes.icon_url = iconUrl;
      }
      if (!Object.keys(changes).length) return json({ error: 'No changes' }, 400);
      const { data, error } = await db.from('apps').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select('id,visibility,title').single();
      if (error) throw error;
      await bumpCatalogVersion();
      return json({ app: data });
    }
    if (request.method === 'POST' && route === 'delete-app') {
      const { id, title } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid app' }, 400);
      const { error } = await db.rpc('owner_delete_app', { p_app_id: id, p_actor_id: user.id, p_expected_title: title });
      if (error) throw error;
      await bumpCatalogVersion();
      return json({ status: 'deleted' });
    }
    if (request.method === 'POST' && route === 'restore-app') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid app' }, 400);
      const { error } = await db.rpc('owner_restore_app', { p_app_id: id, p_actor_id: user.id });
      if (error) throw error;
      return json({ status: 'restored_hidden' });
    }
    if (request.method === 'POST' && route === 'purge-app') {
      const { id, title } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid app' }, 400);
      const { data: app } = await db.from('apps').select('title,deleted_at,icon_url,screenshots').eq('id', id).maybeSingle();
      if (!app?.deleted_at) return json({ error: 'App is not in Trash' }, 409);
      if (app.title !== title) return json({ error: 'Type the exact app name to delete forever' }, 400);
      const { data: releases, error: releaseError } = await db.from('releases').select('storage_key').eq('app_id', id);
      if (releaseError) throw releaseError;
      const { data: pending, error: pendingError } = await db.from('upload_candidates').select('object_key').eq('target_app_id', id);
      if (pendingError) throw pendingError;
      const keys = new Set([...(releases || []).map(row => row.storage_key),...(pending || []).map(row => row.object_key)]);
      await removeApks(keys);
      await removeMedia('app-icons',[app.icon_url]);
      await removeMedia('app-screenshots',app.screenshots || []);
      const { error } = await db.rpc('purge_deleted_app', { p_app_id: id, p_actor_id: user.id, p_expected_title: title });
      if (error) throw error;
      return json({ status: 'purged', removedApks: keys.size });
    }
    if (request.method === 'GET' && route === 'crashes') {
      const { data, error } = await db.from('crash_reports')
        .select('id,version_name,version_code,android_sdk,device_model,message,exception_class,stack_trace,occurred_at,received_at')
        .order('occurred_at', { ascending: false }).limit(200);
      if (error) throw error;
      return json({ crashes: (data || []).map(row => ({
        id: row.id,
        app_version: row.version_name || '',
        version_code: row.version_code,
        android_version: row.android_sdk ? `SDK ${row.android_sdk}` : '',
        device_model: row.device_model || '',
        message: row.message || row.exception_class || 'Unknown error',
        stack: row.stack_trace || row.exception_class || '',
        screen: '',
        device_id: '',
        created_at: row.occurred_at || row.received_at,
      })) });
    }
    if (request.method === 'POST' && route === 'resolve-crash') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid crash' }, 400);
      const { error } = await db.from('crash_reports').delete().eq('id', id);
      if (error) throw error;
      return json({ status: 'resolved' });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Upload unavailable';
    if (inspecting) await db.from('upload_candidates').update({ error: detail.slice(0, 300) }).eq('id', inspecting).eq('owner_id', user.id).eq('status', 'uploaded');
    return json({ error: detail.replace(/https?:\/\/[^\s]+/g, '[private APK URL]') }, 500);
  }
});

function validUrl(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  try { const parsed = new URL(text); if (parsed.protocol !== 'https:' || text.length > 500) throw new Error(); }
  catch { throw new Error('Links must use HTTPS and be under 500 characters'); }
  return text;
}
// Safety guard: only delete objects this function created (pending/<owner>/<candidate>.apk,
// optionally under the r2/ prefix for Cloudflare R2). Shared by single and batched deletes.
const APK_OBJECT_KEY = /^(?:r2\/)?pending\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.apk$/;
async function removeApk(objectKey: string): Promise<void> {
  if (!objectKey || !APK_OBJECT_KEY.test(objectKey)) return;
  if (objectKey.startsWith('r2/')) {
    if (!r2) throw new Error('R2 storage unavailable. Retry deletion later.');
    await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket!, Key: objectKey }));
  } else {
    const { error } = await db.storage.from('apk-files').remove([objectKey]);
    if (error) throw new Error('APK storage deletion failed: '+error.message);
  }
}
// Batched version of removeApk for purge: one Supabase Storage .remove([...]) call for
// all non-R2 keys plus one R2 DeleteObjects call per 1000 keys, instead of N sequential
// round trips. Same guard, same fail-loud semantics: any backend failure throws and the
// purge RPC below never runs, exactly as before.
async function removeApks(objectKeys: Iterable<string>): Promise<void> {
  const storageKeys: string[] = [];
  const r2Keys: string[] = [];
  for (const key of new Set(objectKeys)) {
    if (!key || !APK_OBJECT_KEY.test(key)) continue;
    (key.startsWith('r2/') ? r2Keys : storageKeys).push(key);
  }
  if (r2Keys.length && !r2) throw new Error('R2 storage unavailable. Retry deletion later.');
  if (storageKeys.length) {
    const { error } = await db.storage.from('apk-files').remove(storageKeys);
    if (error) throw new Error('APK storage deletion failed: '+error.message);
  }
  for (let i = 0; i < r2Keys.length; i += 1000) {
    const chunk = r2Keys.slice(i, i + 1000);
    const out = await r2!.send(new DeleteObjectsCommand({ Bucket: r2Bucket!, Delete: { Objects: chunk.map(Key => ({ Key })) } }));
    const failed = (out.Errors || []).map(e => e.Key).filter(Boolean);
    if (failed.length) throw new Error('R2 batch deletion failed for: '+failed.join(','));
  }
}
async function removeMedia(bucket: 'app-icons' | 'app-screenshots', urls: string[]): Promise<void> {
  const prefix = db.storage.from(bucket).getPublicUrl('').data.publicUrl;
  const paths = urls.filter(Boolean).filter(url => url.startsWith(prefix)).map(url => url.slice(prefix.length)).filter(path => managedMediaPath(path));
  if (!paths.length) return;
  const { error } = await db.storage.from(bucket).remove(paths);
  if (error) throw new Error(bucket+' deletion failed: '+error.message);
}
