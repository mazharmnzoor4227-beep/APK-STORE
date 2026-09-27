import { createClient } from 'npm:@supabase/supabase-js@2.58.0';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, secret, { auth: { persistSession: false } });

Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response('App not found', { status: 404 });
  const { data: app } = await db.from('apps').select('id,current_release_id').eq('slug', slug).eq('visibility', 'published').maybeSingle();
  if (!app?.current_release_id) return new Response('App not found', { status: 404 });
  const { data: release } = await db.from('releases').select('storage_key,package_id').eq('id', app.current_release_id).eq('app_id', app.id).eq('status', 'published').maybeSingle();
  if (!release) return new Response('Release not found', { status: 404 });
  const { data, error } = await db.storage.from('apk-files').createSignedUrl(release.storage_key, 60, { download: `${release.package_id}.apk` });
  if (error || !data) return new Response('Download temporarily unavailable', { status: 503 });
  return Response.redirect(data.signedUrl, 302);
});
