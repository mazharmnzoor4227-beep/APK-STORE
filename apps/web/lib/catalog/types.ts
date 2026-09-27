export type CatalogApp = {
  id: string;
  slug: string;
  title: string;
  package_id: string;
  category: string;
  description: string;
  created_at: string;
  current_release_id: string;
};

export type PublishedApp = CatalogApp & {
  release: { id: string; version_code: number; version_name: string; byte_size: number; apk_sha256: string; release_notes: string; published_at: string };
  media: { kind: 'icon' | 'screenshot'; storage_key: string; display_order: number }[];
};

export type CatalogPage = { apps: CatalogApp[]; nextCursor: string | null };
export type RecentUpdate = {
  id: string; app_id: string; version_name: string; version_code: number; published_at: string; release_notes: string;
  app: CatalogApp;
};
