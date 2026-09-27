import type { CatalogApp } from './types.ts';

export async function listOwnerApps(options: { url: string; serviceKey: string; ownerVerified: boolean; fetcher?: typeof fetch }): Promise<CatalogApp[]> {
  if (!options.ownerVerified) throw new Error('Owner authorization required');
  const response = await (options.fetcher ?? fetch)(`${options.url.replace(/\/$/, '')}/rest/v1/apps?select=*&order=created_at.desc`, {
    headers: { apikey: options.serviceKey, Authorization: `Bearer ${options.serviceKey}` }, cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Owner catalog unavailable (${response.status})`);
  return response.json() as Promise<CatalogApp[]>;
}
