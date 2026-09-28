import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.901.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.901.0';
import { parseApkFile, parseApkUrl } from 'npm:simple-apk-parser@0.1.2';
import { createHash } from 'node:crypto';

const origin = 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site';
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
const ownerEmail = 'mazharmanzoor4117@gmail.com';
const maxApkSize = 300 * 1024 * 1024;
const smallLimit = 50 * 1024 * 1024;
const r2Bucket = Deno.env.get('R2_BUCKET');
const r2 = Deno.env.get('R2_ACCOUNT_ID') && Deno.env.get('R2_ACCESS_KEY_ID') && Deno.env.get('R2_SECRET_ACCESS_KEY') && r2Bucket
  ? new S3Client({ region: 'auto', endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`, credentials: { accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!, secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')! } }) : null;
function json(value: unknown, status = 200) { return Response.json(value, { status, headers }); }

Deno.serve(async (request) => {
  if (request.headers.get('origin') !== origin) return json({ error: 'Origin not allowed' }, 403);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
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
        return json({ error: 'Select an APK up to 300 MB' }, 400);
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
    if (request.method === 'POST' && route === 'complete') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
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
      const { error } = await db.from('upload_candidates').update({ status: 'uploaded' }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploading');
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
        : await parseApkFile(await (await fetch(signedUrl)).blob(), { locale: 'en-US' });
      const certificates = parsed.signatures.filter((s: { found: boolean; certificate?: { sha256?: string } }) => s.found && s.certificate?.sha256).map((s: { certificate: { sha256: string } }) => s.certificate.sha256.toLowerCase());
      if (!parsed.packageName || !Number.isSafeInteger(parsed.versionCode) || parsed.versionCode <= 0 || !certificates.length || new Set(certificates).size !== 1)
        return json({ error: 'APK package, version or signer could not be verified' }, 422);
      const download = await fetch(signedUrl);
      if (!download.ok || !download.body) throw new Error('APK could not be read for checksum');
      const hash = createHash('sha256'); let bytes = 0;
      for await (const chunk of download.body) { bytes += chunk.byteLength; if (bytes > maxApkSize) throw new Error('APK exceeds size limit'); hash.update(chunk); }
      if (bytes !== Number(candidate.byte_size)) return json({ error: 'APK size changed after upload' }, 409);
      const metadata = parsed as typeof parsed & { minSdkVersion?: number; targetSdkVersion?: number; minSdk?: number; targetSdk?: number; permissions?: string[]; abis?: string[] };
      const inspection = { packageId: parsed.packageName, versionCode: parsed.versionCode, versionName: parsed.versionName || String(parsed.versionCode), certificateSha256: certificates[0], apkSha256: hash.digest('hex'), appName: String(parsed.appName || parsed.packageName).slice(0, 100), minSdk: metadata.minSdkVersion || metadata.minSdk || null, targetSdk: metadata.targetSdkVersion || metadata.targetSdk || null, permissions: Array.isArray(metadata.permissions) ? metadata.permissions.slice(0, 300) : [], abis: Array.isArray(metadata.abis) ? metadata.abis.slice(0, 20) : [] };
      if (parsed.iconBlob && parsed.iconBlob.size <= 1048576 && ['image/png','image/jpeg','image/webp'].includes(parsed.iconBlob.type)) {
        const iconKey = `${id}.${parsed.iconBlob.type.split('/')[1] === 'jpeg' ? 'jpg' : parsed.iconBlob.type.split('/')[1]}`;
        const { error } = await db.storage.from('app-icons').upload(iconKey, parsed.iconBlob, { contentType: parsed.iconBlob.type, upsert: true });
        if (!error) Object.assign(inspection, { iconUrl: db.storage.from('app-icons').getPublicUrl(iconKey).data.publicUrl });
      }
      const { error } = await db.from('upload_candidates').update({ status: 'inspected', inspection, error: null }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploaded');
      if (error) throw error;
      return json({ inspection });
    }
    if (request.method === 'POST' && route === 'discard') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
      const { error } = await db.rpc('reject_candidate', { p_candidate_id: id, p_actor_id: user.id, p_reason: 'Discarded by owner' });
      if (error) throw error;
      return json({ status: 'rejected' });
    }
    if (request.method === 'POST' && route === 'publish') {
      const input = await request.json();
      if (typeof input.id !== 'string' || !/^[0-9a-f-]{36}$/.test(input.id)) return json({ error: 'Invalid upload' }, 400);
      const { data: candidate } = await db.from('upload_candidates').select('inspection,status').eq('id', input.id).eq('owner_id', user.id).maybeSingle();
      if (candidate?.status !== 'inspected') return json({ error: 'Inspect the APK first' }, 409);
      const title = String(input.title || '').trim().slice(0, 100);
      const category = String(input.category || 'Tools').trim().slice(0, 60);
      const description = String(input.description || '').trim().slice(0, 2000);
      const releaseNotes = String(input.releaseNotes || '').trim().slice(0, 1000);
      const slug = String(input.slug || candidate.inspection.packageId.replaceAll('.', '-')).toLowerCase();
      if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return json({ error: 'Enter a valid app name' }, 400);
      const sourceUrl = input.sourceUrl !== undefined ? validUrl(input.sourceUrl) : undefined;
      const fdroidUrl = input.fdroidUrl !== undefined ? validUrl(input.fdroidUrl) : undefined;
      const { data: appId, error } = await db.rpc('publish_candidate', { p_candidate_id: input.id, p_actor_id: user.id, p_slug: slug, p_title: title, p_category: category, p_description: description, p_release_notes: releaseNotes });
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
      return json({ appId, slug });
    }
    if (request.method === 'GET' && route === 'apps') {
      const { data, error } = await db.from('apps').select('id,slug,title,package_id,category,description,short_description,icon_url,visibility,current_release_id,updated_at,screenshots,license,source_url,fdroid_url,price_type,is_recommended,min_sdk').order('updated_at', { ascending: false }).limit(200);
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
      const ext = String(input.filename || '').toLowerCase().match(/\\.(png|jpg|webp)$/)?.[1];
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
      const { data: app } = await db.from('apps').select('id,current_release_id').eq('id', id).maybeSingle();
      if (!app) return json({ error: 'App not found' }, 404);
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
        if (!/^[0-9a-f-]{36}\\.(png|jpg|webp)$/.test(name)) return json({ error: 'Upload icon in this panel first' }, 400);
        const { data: icon, error } = await db.storage.from('app-icons').info('admin/' + name);
        if (error || !icon || Number(icon.size) > 300000) return json({ error: 'Icon missing or too large' }, 400);
        changes.icon_url = iconUrl;
      }
      if (!Object.keys(changes).length) return json({ error: 'No changes' }, 400);
      const { data, error } = await db.from('apps').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id).select('id,visibility,title').single();
      if (error) throw error;
      return json({ app: data });
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
