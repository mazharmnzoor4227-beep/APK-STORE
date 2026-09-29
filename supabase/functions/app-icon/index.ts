import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { trustedIconSource } from './trusted-icon-source.mjs';
import { durableIconPath } from './icon-storage.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
const MAX_ICON_BYTES = 1_048_576;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const requestUrl = new URL(request.url);
  if (requestUrl.searchParams.get('client') !== 'apkstore-android') return new Response('Unauthorized', { status: 401 });
  const slug = requestUrl.searchParams.get('slug') ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response('Icon not found', { status: 404 });

  const { data: app, error } = await db
    .from('apps')
    .select('id,icon_source_url')
    .eq('slug', slug)
    .eq('visibility', 'published')
    .maybeSingle();

  if (error || !app?.icon_source_url || !trustedIconSource(app.icon_source_url)) {
    return new Response('Icon not found', { status: 404 });
  }

  try {
    const upstream = await fetch(app.icon_source_url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'APK-STORE/1.0 icon proxy' },
    });
    if (!upstream.ok || !trustedIconSource(upstream.url)) return new Response('Icon unavailable', { status: 502 });

    const contentType = (upstream.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) return new Response('Unsupported icon type', { status: 415 });

    const declaredSize = Number(upstream.headers.get('content-length') ?? '0');
    if (declaredSize > MAX_ICON_BYTES) return new Response('Icon too large', { status: 413 });

    const bytes = new Uint8Array(await upstream.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) return new Response('Icon too large', { status: 413 });

    // Turn fragile upstream hotlinks into durable store-owned icon URLs. This is
    // best-effort: a temporary storage/database issue must not make a valid icon
    // disappear from a client that already reached the proxy successfully.
    const objectPath = durableIconPath(app.id, contentType);
    if (objectPath) {
      const { error: uploadError } = await db.storage.from('app-icons').upload(objectPath, bytes, {
        contentType,
        upsert: true,
        cacheControl: '31536000',
      });
      if (!uploadError) {
        const publicUrl = db.storage.from('app-icons').getPublicUrl(objectPath).data.publicUrl;
        const { error: updateError } = await db
          .from('apps')
          .update({ icon_url: publicUrl, updated_at: new Date().toISOString() })
          .eq('id', app.id)
          .eq('visibility', 'published');
        if (updateError) console.error('icon_url persistence failed', updateError.message);
      } else {
        console.error('icon persistence upload failed', uploadError.message);
      }
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        'Content-Length': String(bytes.byteLength),
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('icon proxy failed', error instanceof Error ? error.message : 'unknown error');
    return new Response('Icon unavailable', { status: 502 });
  }
});
