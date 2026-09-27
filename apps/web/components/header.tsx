import Link from 'next/link';
import { ThemeControl } from './theme-control';

export function Header() {
  return <header className="site-header"><div className="site-container header-inner">
    <Link href="/" className="brand" aria-label="APK STORE home"><span className="brand-icon" aria-hidden="true"><span /></span><span>APK<span className="brand-light">STORE</span></span><span className="brand-cursor" aria-hidden="true">_</span></Link>
    <nav className="primary-nav" aria-label="Primary"><Link href="/">Explore</Link><Link href="/search">Search</Link><Link href="/updates">Updates</Link></nav>
    <ThemeControl />
  </div></header>;
}
