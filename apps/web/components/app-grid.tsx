import Link from 'next/link';
import type { CatalogApp } from '../lib/catalog/types';

export function AppGrid({ apps }: { apps: CatalogApp[] }) {
  return <div className="app-grid">{apps.map(app => <Link className="app-card" href={`/apps/${app.slug}`} key={app.id}>
    <div className="app-icon" aria-hidden="true">{app.title.slice(0, 1).toUpperCase()}</div>
    <div><span className="section-index">{app.category}</span><h3>{app.title}</h3><p>{app.description || app.package_id}</p><span className="card-link">View app ↗</span></div>
  </Link>)}</div>;
}
