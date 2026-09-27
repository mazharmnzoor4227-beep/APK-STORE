import type { CatalogApp, CatalogPage, PublishedApp, RecentUpdate } from './types.ts';

type Options = { url: string; key: string; fetcher?: typeof fetch };
type Cursor = { created_at: string; id: string };

function decodeCursor(value: string): Cursor {
  try {
    const result = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (typeof result.id !== 'string' || !/^[\w-]+$/.test(result.id) || typeof result.created_at !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|\+\d\d:\d\d)$/.test(result.created_at)) throw new Error();
    return result;
  } catch { throw new Error('Invalid catalog cursor'); }
}

function makeCursor(row: CatalogApp): string {
  return Buffer.from(JSON.stringify({ created_at: row.created_at, id: row.id })).toString('base64url');
}

export function createCatalogReader({ url, key, fetcher = fetch }: Options) {
  const endpoint = url.replace(/\/$/, '') + '/rest/v1/';
  async function request<T>(resource: string, params: URLSearchParams): Promise<T[]> {
    const response = await fetcher(`${endpoint}${resource}?${params}`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Catalog unavailable (${response.status})`);
    return response.json() as Promise<T[]>;
  }
  return {
    async listRecentUpdates(): Promise<RecentUpdate[]> {
      const releases = await request<Omit<RecentUpdate, 'app'>>('releases', new URLSearchParams({
        select: 'id,app_id,version_name,version_code,published_at,release_notes',
        status: 'eq.published', order: 'published_at.desc', limit: '20',
      }));
      if (!releases.length) return [];
      const ids = releases.map(release => release.app_id).filter(id => /^[0-9a-f-]{36}$/i.test(id));
      if (!ids.length) return [];
      const apps = await request<CatalogApp>('apps', new URLSearchParams({
        select: 'id,slug,title,package_id,category,description,created_at,current_release_id',
        id: `in.(${ids.join(',')})`, visibility: 'eq.published',
      }));
      const byId = new Map(apps.map(app => [app.id, app]));
      return releases.flatMap(release => {
        const app = byId.get(release.app_id);
        return app && app.current_release_id === release.id ? [{ ...release, app }] : [];
      });
    },
    async listPublishedApps(query = '', cursor: string | null = null): Promise<CatalogPage> {
      const params = new URLSearchParams({ select: 'id,slug,title,package_id,category,description,created_at,current_release_id', visibility: 'eq.published', current_release_id: 'not.is.null', order: 'created_at.desc,id.desc', limit: '20' });
      const search = query.trim().slice(0, 80);
      if (search) params.set('title', `ilike.*${search.replace(/[*,()\\]/g, ' ')}*`);
      if (cursor) {
        const { created_at, id } = decodeCursor(cursor);
        params.set('or', `(created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id}))`);
      }
      const apps = await request<CatalogApp>('apps', params);
      return { apps, nextCursor: apps.length ? makeCursor(apps[apps.length - 1]) : null };
    },
    async getPublishedApp(slug: string): Promise<PublishedApp | null> {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
      const params = new URLSearchParams({ select: 'id,slug,title,package_id,category,description,created_at,current_release_id', slug: `eq.${slug}`, visibility: 'eq.published', limit: '1' });
      const [app] = await request<CatalogApp>('apps', params);
      if (!app) return null;
      const releaseParams = new URLSearchParams({ select: 'id,version_code,version_name,byte_size,apk_sha256,release_notes,published_at', id: `eq.${app.current_release_id}`, status: 'eq.published', limit: '1' });
      const [release] = await request<PublishedApp['release']>('releases', releaseParams);
      if (!release) return null;
      const mediaParams = new URLSearchParams({ select: 'kind,storage_key,display_order', app_id: `eq.${app.id}`, order: 'display_order.asc' });
      const media = await request<PublishedApp['media'][number]>('media', mediaParams);
      return { ...app, release, media };
    },
  };
}

export function publicCatalog() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createCatalogReader({ url, key });
}
