import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { S3Client, PutObjectCommand, HeadObjectCommand } from 'npm:@aws-sdk/client-s3@3.901.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.901.0';

const origin = 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site';
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
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

  try {
    const route = new URL(request.url).searchParams.get('action') || '';
    if (request.method === 'GET' && route === 'list') {
      const { data, error } = await db.from('upload_candidates').select('id,filename,byte_size,status,error,created_at').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(30);
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
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload unavailable' }, 500);
  }
});
