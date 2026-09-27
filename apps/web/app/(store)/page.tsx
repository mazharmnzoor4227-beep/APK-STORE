import { Header } from '../../components/header';
import { AppGrid } from '../../components/app-grid';
import { publicCatalog } from '../../lib/catalog/public';
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const catalog = publicCatalog();
  const { apps } = catalog ? await catalog.listPublishedApps() : { apps: [] };
  return <>
    <Header />
    <main id="main-content" className="site-container">
      <section className="hero" aria-labelledby="discover-title">
        <div className="eyebrow"><span className="signal" /> THE ANDROID COLLECTION</div>
        <h1 id="discover-title">Find your next<br />favorite app<span className="green-dot">.</span></h1>
        <p>Explore independent apps and download their latest approved release.</p>
      </section>
      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><span className="section-index">DISCOVER / APPS</span><h2 id="catalog-title">Latest apps</h2></div><a href="/search" className="section-more">Browse all ↗</a></div>
        {apps.length ? <AppGrid apps={apps} /> : <div className="empty-state"><div className="empty-mark" aria-hidden="true">▢</div><h3>No apps published yet</h3><p>The first approved release will appear here automatically.</p></div>}
      </section>
    </main>
    <footer className="site-footer"><div className="site-container footer-inner"><span>APK STORE <span className="green-dot">●</span></span><span>Independent apps. Direct downloads.</span></div></footer>
  </>;
}
