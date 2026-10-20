import { createClient } from 'npm:@supabase/supabase-js@2.58.0';
import { S3Client, GetObjectCommand, HeadObjectCommand } from 'npm:@aws-sdk/client-s3@3.901.0';
import { getSignedUrl } from 'npm:@aws-sdk/s3-request-presigner@3.901.0';
import { trustedExternalApkUrl } from './trusted-external-apk-url.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, secret, { auth: { persistSession: false } });

// Short-TTL in-memory cache: slug -> release resolution. Identical for every
// visitor; release rows change only when the admin publishes (and the 60s TTL
// bounds staleness). Per-isolate Map: warm isolates skip the two DB round
// trips on repeat downloads. Keyed by slug only — no user data involved.
type Resolved = { appId: string; storageKey: string; packageId: string; externalUrl: string | null; githubOwner: string | null; githubRepo: string | null; storage: boolean };
const resolveCache = new Map<string, { exp: number; r: Resolved }>();
const RESOLVE_TTL_MS = 60_000;

// Hoisted R2 client: previously constructed fresh on every download request.
const r2Conf = (() => {
  const account = Deno.env.get('R2_ACCOUNT_ID');
  const key = Deno.env.get('R2_ACCESS_KEY_ID');
  const secretKey = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET');
  if (!account || !key || !secretKey || !bucket) return null;
  return { bucket, client: new S3Client({ region: 'auto', endpoint: `https://${account}.r2.cloudflarestorage.com`, credentials: { accessKeyId: key, secretAccessKey: secretKey } }) };
})();

// Brief browser cache on the 302 itself: the redirect target is stable per
// release, and signed URLs live >= 60s (R2: 1h), so max-age=30 can never serve
// an expired URL. `private` keeps signed-URL tokens out of shared caches.
// First-party copies win: upstream origins (F-Droid's single server, GitHub
// release CDN) crawl on the owner's routes, while bytes already mirrored into
// the store's own storage serve from the storage edge. Existence is probed
// once per resolve (cached with it, 60s) and any probe error falls back to
// the historical external-first behavior.
async function storageExists(key: string): Promise<boolean> {
  try {
    if (key.startsWith('r2/')) {
      if (!r2Conf) return false;
      await r2Conf.client.send(new HeadObjectCommand({ Bucket: r2Conf.bucket, Key: key }));
      return true;
    }
    const slash = key.lastIndexOf('/');
    const dir = slash >= 0 ? key.slice(0, slash) : '';
    const file = slash >= 0 ? key.slice(slash + 1) : key;
    const { data } = await db.storage.from('apk-files').list(dir, { limit: 5, search: file });
    return !!data && data.some((o: { name: string }) => o.name === file);
  } catch { return false; }
}

function redirectCached(target: string | URL) {
  return new Response(null, { status: 302, headers: { location: String(target), 'cache-control': 'private, max-age=30' } });
}

Deno.serve(async (request) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  const slug = new URL(request.url).searchParams.get('slug') ?? '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return new Response('App not found', { status: 404 });
  let hit = resolveCache.get(slug);
  if (hit && hit.exp < Date.now()) { resolveCache.delete(slug); hit = undefined; }
  let r: Resolved;
  if (hit) {
    r = hit.r;
  } else {
    const { data: app } = await db.from('apps').select('id,current_release_id,github_owner,github_repo').eq('slug', slug).eq('visibility', 'published').maybeSingle();
    if (!app?.current_release_id) return new Response('App not found', { status: 404 });
    const { data: release } = await db.from('releases').select('storage_key,package_id,external_url').eq('id', app.current_release_id).eq('app_id', app.id).eq('status', 'published').maybeSingle();
    if (!release) return new Response('Release not found', { status: 404 });
    r = { appId: app.id, storageKey: release.storage_key, packageId: release.package_id, externalUrl: release.external_url ?? null, githubOwner: app.github_owner ?? null, githubRepo: app.github_repo ?? null, storage: await storageExists(release.storage_key) };
    resolveCache.set(slug, { exp: Date.now() + RESOLVE_TTL_MS, r });
    if (resolveCache.size > 500) { const oldest = resolveCache.keys().next().value; if (oldest) resolveCache.delete(oldest); }
  }
  if (!r.storage && r.externalUrl) {
    const asset = new URL(r.externalUrl);
    const ownAsset = asset.origin === 'https://apk-store-mazhar.mazharmanzoor4117.chatgpt.site' && /^\/[A-Za-z0-9._-]+\.apk$/.test(asset.pathname);
    const upstreamAsset = trustedExternalApkUrl(r.externalUrl, {
      githubOwner: r.githubOwner,
      githubRepo: r.githubRepo,
      packageId: r.packageId,
    });
    if (!ownAsset && !upstreamAsset) return new Response('Download temporarily unavailable', { status: 503 });
    return redirectCached(asset);
  }
  if (r.storageKey.startsWith('r2/')) {
    if (!r2Conf) return new Response('Download temporarily unavailable', { status: 503 });
    const signedUrl = await getSignedUrl(r2Conf.client, new GetObjectCommand({ Bucket: r2Conf.bucket, Key: r.storageKey, ResponseContentDisposition: `attachment; filename="${r.packageId}.apk"` }), { expiresIn: 3600 });
    return redirectCached(signedUrl);
  }
  const { data, error } = await db.storage.from('apk-files').createSignedUrl(r.storageKey, 3600, { download: `${r.packageId}.apk` });
  if (error || !data) return new Response('Download temporarily unavailable', { status: 503 });
  return redirectCached(data.signedUrl);
});
