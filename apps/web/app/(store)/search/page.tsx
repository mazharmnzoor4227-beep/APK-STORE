import { Header } from '../../../components/header';

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <><Header /><main className="site-container inner-page"><span className="section-index">SEARCH / APPS</span><h1>Search apps<span className="green-dot">.</span></h1><form className="search-form" action="/search" role="search"><label className="sr-only" htmlFor="search-query">Search apps</label><input id="search-query" name="q" type="search" defaultValue={q || ''} placeholder="Search apps" aria-label="Search apps" /><button type="submit">Search ↗</button></form><div className="empty-state"><h2>{q ? `No apps found for “${q}”` : 'Explore the catalog'}</h2><p>Published apps will appear here when they are available.</p></div></main></>;
}
