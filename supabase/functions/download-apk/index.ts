import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { S3Client, GetObjectCommand } from 'npm:@aws-sdk/client-s3@3.901.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.901.0';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, secret, { auth: { persistSession: false } });

Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response('App not found', { status: 404 });
  const { data: app } = await db.from('apps').select('id,current_release_id').eq('slug', slug).eq('visibility', 'published').maybeSingle();
  if (!app?.current_release_id) return new Response('App not found', { status: 404 });
  const { data: release } = await db.from('releases').select('storage_key,package_id,external_url').eq('id', app.current_release_id).eq('app_id', app.id).eq('status', 'published').maybeSingle();
  if (!release) return new Response('Release not found', { status: 404 });
  if (release.external_url) {
    const asset = new URL(release.external_url);
    if (asset.origin !== 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site' || !/^\/[A-Za-z0-9._-]+\.apk$/.test(asset.pathname)) {
      return new Response('Download temporarily unavailable', { status: 503 });
    }
    return Response.redirect(asset, 302);
  }
  if (release.storage_key.startsWith('r2/')) {
    const account = Deno.env.get('R2_ACCOUNT_ID');
    const key = Deno.env.get('R2_ACCESS_KEY_ID');
    const secretKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
    const bucket = Deno.env.get('R2_BUCKET');
    if (!account || !key || !secretKey || !bucket) return new Response('Download temporarily unavailable', { status: 503 });
    const r2 = new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secretKey } });
    const signedUrl = await getSignedUrl(r2, new GetObjectCommand({ Bucket: bucket, Key: release.storage_key, ResponseContentDisposition: `attachment; filename="${release.package_id}.apk"` }), { expiresIn: 3600 });
    return Response.redirect(signedUrl, 302);
  }
  const { data, error } = await db.storage.from('apk-files').createSignedUrl(release.storage_key, 60, { download: `${release.package_id}.apk` });
  if (error || !data) return new Response('Download temporarily unavailable', { status: 503 });
  return Response.redirect(data.signedUrl, 302);
});
