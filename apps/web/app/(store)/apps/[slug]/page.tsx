import { notFound } from 'next/navigation';
import { Header } from '../../../../components/header';
import { publicCatalog } from '../../../../lib/catalog/public';

export default async function AppPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const app = await publicCatalog()?.getPublishedApp(slug);
  if (!app) notFound();
  return <><Header /><main className="site-container inner-page app-detail"><span className="section-index">APP / {app.category.toUpperCase()}</span><div className="app-detail-heading"><div className="app-icon" aria-hidden="true">{app.title.slice(0, 1).toUpperCase()}</div><div><h1>{app.title}<span className="green-dot">.</span></h1><p>{app.package_id}</p></div></div><p className="app-description">{app.description}</p><a className="action-button download-button" href={`/api/download/${encodeURIComponent(slug)}`}>Download APK ↗</a><section className="release-panel"><h2>Current release</h2><dl><div><dt>Version</dt><dd>{app.release.version_name} ({app.release.version_code})</dd></div><div><dt>Size</dt><dd>{(app.release.byte_size / 1048576).toFixed(1)} MB</dd></div><div><dt>SHA-256</dt><dd className="hash">{app.release.apk_sha256}</dd></div></dl>{app.release.release_notes && <p>{app.release.release_notes}</p>}</section></main></>;
}
