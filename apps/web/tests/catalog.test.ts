import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogReader } from '../lib/catalog/public.ts';
import { listOwnerApps } from '../lib/catalog/owner.ts';

test('public catalog asks only for published current releases and uses stable cursor ordering', async () => {
  const requests: URL[] = [];
  const reader = createCatalogReader({
    url: 'https://example.supabase.co', key: 'public-key',
    fetcher: async (input) => {
      requests.push(new URL(String(input)));
      return new Response(JSON.stringify([{ id: 'a', slug: 'alpha', title: 'Alpha', package_id: 'dev.alpha', category: 'Tools', created_at: '2026-09-20T00:00:00Z', current_release_id: 'r1' }]), { headers: { 'content-type': 'application/json' } });
    },
  });
  const result = await reader.listPublishedApps('', null);
  assert.equal(result.apps[0].slug, 'alpha');
  assert.equal(requests[0].searchParams.get('visibility'), 'eq.published');
  assert.equal(requests[0].searchParams.get('current_release_id'), 'not.is.null');
  assert.equal(requests[0].searchParams.get('order'), 'created_at.desc,id.desc');
  await reader.listPublishedApps('', result.nextCursor);
  assert.match(requests[1].searchParams.get('or') ?? '', /created_at\.lt\.2026-09-20/);
});

test('catalog search encodes the query and rejects a forged cursor', async () => {
  const requests: URL[] = [];
  const reader = createCatalogReader({ url: 'https://example.supabase.co', key: 'public-key', fetcher: async (input) => {
    requests.push(new URL(String(input)));
    return new Response('[]', { headers: { 'content-type': 'application/json' } });
  }});
  await reader.listPublishedApps('tools & games', null);
  assert.equal(requests[0].searchParams.get('title'), 'ilike.*tools & games*');
  await assert.rejects(reader.listPublishedApps('', 'forged'), /Invalid catalog cursor/);
  const injected = Buffer.from(JSON.stringify({ created_at: '2026-09-20T00:00:00Z),visibility.eq.draft', id: 'a' })).toString('base64url');
  await assert.rejects(reader.listPublishedApps('', injected), /Invalid catalog cursor/);
});

test('app details include only the published current release and ordered screenshots', async () => {
  const reader = createCatalogReader({ url: 'https://example.supabase.co', key: 'public-key', fetcher: async (input) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/apps')) return new Response(JSON.stringify([{ id: 'app1', slug: 'alpha', current_release_id: 'r2', title: 'Alpha' }]));
    if (path.endsWith('/releases')) return new Response(JSON.stringify([{ id: 'r2', version_name: '2.0', version_code: 2 }]));
    if (path.endsWith('/media')) return new Response(JSON.stringify([{ kind: 'icon', storage_key: 'icon.png' }, { kind: 'screenshot', storage_key: 'screen.png' }]));
    return new Response('[]');
  }});
  const app = await reader.getPublishedApp('alpha');
  assert.equal(app?.release.version_name, '2.0');
  assert.equal(app?.media[1].storage_key, 'screen.png');
});

test('owner catalog refuses unverified callers before any network request', async () => {
  let called = false;
  await assert.rejects(listOwnerApps({ url: 'https://example.supabase.co', serviceKey: 'secret', ownerVerified: false, fetcher: async () => { called = true; return new Response('[]'); } }), /Owner authorization required/);
  assert.equal(called, false);
});

test('updates show only the current release of a published app', async () => {
  const requests: URL[] = [];
  const reader = createCatalogReader({ url: 'https://example.supabase.co', key: 'public-key', fetcher: async input => {
    const target = new URL(String(input));
    requests.push(target);
    if (target.pathname.endsWith('/releases')) return new Response(JSON.stringify([
      { id: 'release-new', app_id: '10000000-0000-4000-8000-000000000001', version_name: '2.0', version_code: 2 },
      { id: 'release-old', app_id: '10000000-0000-4000-8000-000000000001', version_name: '1.0', version_code: 1 },
    ]));
    return new Response(JSON.stringify([{ id: '10000000-0000-4000-8000-000000000001', slug: 'alpha', title: 'Alpha', current_release_id: 'release-new' }]));
  }});
  const updates = await reader.listRecentUpdates();
  assert.deepEqual(updates.map(update => update.id), ['release-new']);
  assert.equal(updates[0].app.slug, 'alpha');
  assert.equal(requests[0].searchParams.get('status'), 'eq.published');
  assert.equal(requests[1].searchParams.get('visibility'), 'eq.published');
});
