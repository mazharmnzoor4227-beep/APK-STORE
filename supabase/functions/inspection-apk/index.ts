import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.901.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.901.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
const r2Bucket = Deno.env.get('R2_BUCKET');
const r2 = Deno.env.get('R2_ACCOUNT_ID') && Deno.env.get('R2_ACCESS_KEY_ID') && Deno.env.get('R2_SECRET_ACCESS_KEY') && r2Bucket
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${Deno.env.get('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: Deno.env.get('R2_ACCESS_KEY_ID')!,
        secretAccessKey: Deno.env.get('R2_SECRET_ACCESS_KEY')!,
      },
    })
  : null;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

Deno.serve(async request => {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (request.headers.get('authorization') !== `Bearer ${serviceRole}`) return json({ error: 'Forbidden' }, 403);

  const id = new URL(request.url).searchParams.get('candidate') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Candidate not found' }, 404);

  const { data: candidate, error } = await db
    .from('upload_candidates')
    .select('object_key,byte_size,status,expires_at')
    .eq('id', id)
    .maybeSingle();
  if (error || !candidate) return json({ error: 'Candidate not found' }, 404);
  if (!['uploaded', 'inspected'].includes(candidate.status)) return json({ error: 'Upload is not ready for inspection' }, 409);
  if (Date.parse(candidate.expires_at) < Date.now()) return json({ error: 'Candidate expired' }, 410);

  const objectKey = String(candidate.object_key || '');
  const safeKey = /^(?:candidates\/[0-9a-f-]{36}|pending\/[0-9a-f-]{36}\/[0-9a-f-]{36}|r2\/pending\/[0-9a-f-]{36}\/[0-9a-f-]{36})\.apk$/.test(objectKey);
  if (!safeKey) return json({ error: 'Candidate storage path is invalid' }, 409);

  if (objectKey.startsWith('r2/')) {
    if (!r2 || !r2Bucket) return json({ error: 'Large APK storage unavailable' }, 503);
    const signedUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: r2Bucket, Key: objectKey }), { expiresIn: 900 });
    return json({ signedUrl, byteSize: Number(candidate.byte_size) });
  }

  const { data, error: signedError } = await db.storage.from('apk-files').createSignedUrl(objectKey, 900);
  if (signedError || !data?.signedUrl) return json({ error: 'APK storage unavailable' }, 503);
  return json({ signedUrl: data.signedUrl, byteSize: Number(candidate.byte_size) });
});
