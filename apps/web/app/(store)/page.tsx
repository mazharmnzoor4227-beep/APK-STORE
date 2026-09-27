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
        <div className="eyebrow"><span className="signal" /> Independent Android apps</div>
        <h1 id="discover-title">Discover apps<span className="green-dot">.</span></h1>
        <p>Explore original Android apps, review every release, and download directly from their creator.</p>
        <form className="search-form" action="/search" role="search">
          <label className="sr-only" htmlFor="app-search">Search apps</label>
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input id="app-search" name="q" type="search" placeholder="Search apps" aria-label="Search apps" />
          <button type="submit">Search <span aria-hidden="true">↗</span></button>
        </form>
        <div className="hero-meta"><span>CURATED RELEASES</span><span>DIRECT APK DOWNLOADS</span><span>VERSION TRANSPARENCY</span></div>
      </section>
      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading"><div><span className="section-index">01 / CATALOG</span><h2 id="catalog-title">Latest apps</h2></div></div>
        {apps.length ? <AppGrid apps={apps} /> : <div className="empty-state"><div className="empty-mark" aria-hidden="true">⌁</div><h3>The store is getting ready</h3><p>Apps will appear here after the creator reviews and publishes their first release.</p></div>}
      </section>
    </main>
    <footer className="site-footer"><div className="site-container footer-inner"><span>APK STORE <span className="green-dot">●</span></span><span>Independent apps. Direct downloads.</span></div></footer>
  </>;
}
