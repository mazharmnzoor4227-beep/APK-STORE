import Link from 'next/link';
import { Header } from '../../../components/header';
import { publicCatalog } from '../../../lib/catalog/public';

export const dynamic = 'force-dynamic';

export default async function UpdatesPage() {
  const updates = await publicCatalog()?.listRecentUpdates() ?? [];
  return <><Header /><main className="site-container inner-page">
    <span className="section-index">RELEASES / UPDATES</span>
    <h1>Latest updates<span className="green-dot">.</span></h1>
    {updates.length ? <div className="app-grid">{updates.map(update => <Link className="app-card" href={`/apps/${update.app.slug}`} key={update.id}>
      <div className="app-icon" aria-hidden="true">{update.app.title.slice(0, 1).toUpperCase()}</div>
      <div><span className="section-index">VERSION {update.version_name}</span><h3>{update.app.title}</h3><p>{update.release_notes || update.app.description}</p><span className="card-link">View release ↗</span></div>
    </Link>)}</div> : <div className="empty-state"><h2>No releases yet</h2><p>Approved versions will appear here automatically.</p></div>}
  </main></>;
}
