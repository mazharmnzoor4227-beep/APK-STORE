import Link from 'next/link';
import { ThemeControl } from './theme-control';

export function Header() {
  return <header className="site-header"><div className="site-container header-inner">
    <Link href="/" className="brand" aria-label="APK STORE home"><span className="brand-icon" aria-hidden="true"><span /></span><span>APK<span className="brand-light">STORE</span></span><span className="brand-cursor" aria-hidden="true">_</span></Link>
    <form className="header-search" action="/search" role="search"><label className="sr-only" htmlFor="header-query">Search apps</label><span aria-hidden="true">⌕</span><input id="header-query" name="q" type="search" placeholder="Search apps and games" /><button type="submit" aria-label="Submit search">↗</button></form>
    <ThemeControl />
  </div><nav className="site-container store-tabs" aria-label="Store sections"><Link href="/">Discover</Link><Link href="/search">All apps</Link><Link href="/updates">Updates</Link><Link href="/admin/login">Creator dashboard</Link></nav></header>;
}
