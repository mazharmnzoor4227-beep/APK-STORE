import Link from 'next/link';
import { Header } from '../../../components/header';
import { ThemeControl } from '../../../components/theme-control';

export default function SettingsPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / SETTINGS</span><h1>Settings</h1><p>Manage owner access, appearance and live catalog checks.</p><section className="review-list"><article className="review-item"><h2>Appearance</h2><ThemeControl /></article><article className="review-item"><h2>Owner account</h2><p>Password and sign-out controls require an authenticated owner session.</p></article><article className="review-item"><h2>Catalog</h2><p>Validate the live published catalog before sharing changes.</p></article></section><div className="review-actions"><Link href="/admin/apps/new">Back to store manager</Link></div></main></>;
}
