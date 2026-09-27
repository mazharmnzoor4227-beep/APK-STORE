import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const origin = 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site';
const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
const ownerEmail = 'mazharmanzoor4117@gmail.com';
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
      if (!/^[^/\\]{1,160}\.apk$/i.test(filename) || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 52428800)
        return json({ error: 'Select an APK up to 50 MB' }, 400);
      const id = crypto.randomUUID();
      const objectKey = `pending/${user.id}/${id}.apk`;
      const { error: insertError } = await db.from('upload_candidates').insert({ id, owner_id: user.id, filename, byte_size: byteSize, object_key: objectKey });
      if (insertError) throw insertError;
      const { data: signed, error: signedError } = await db.storage.from('apk-files').createSignedUploadUrl(objectKey);
      if (signedError || !signed) {
        await db.from('upload_candidates').delete().eq('id', id).eq('owner_id', user.id);
        throw signedError || new Error('Upload could not be prepared');
      }
      return json({ id, signedUrl: signed.signedUrl });
    }
    if (request.method === 'POST' && route === 'complete') {
      const { id } = await request.json();
      if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid upload' }, 400);
      const { data: candidate } = await db.from('upload_candidates').select('object_key,byte_size,expires_at').eq('id', id).eq('owner_id', user.id).eq('status', 'uploading').maybeSingle();
      if (!candidate || Date.parse(candidate.expires_at) < Date.now()) return json({ error: 'Upload expired' }, 409);
      const { data: object } = await db.storage.from('apk-files').info(candidate.object_key);
      if (!object || Number(object.size) !== Number(candidate.byte_size)) return json({ error: 'File missing or size mismatch' }, 409);
      const { error } = await db.from('upload_candidates').update({ status: 'uploaded' }).eq('id', id).eq('owner_id', user.id).eq('status', 'uploading');
      if (error) throw error;
      return json({ status: 'uploaded' });
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload unavailable' }, 500);
  }
});
