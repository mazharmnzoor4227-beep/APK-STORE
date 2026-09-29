import Link from 'next/link';
import { Header } from '../../../components/header';
import { ThemeControl } from '../../../components/theme-control';
import { AdminSettings } from '../../../components/admin-settings';

export default function SettingsPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / SETTINGS</span><h1>Settings</h1><p>Manage owner access, appearance and live catalog checks.</p><section className="review-list"><article className="review-item"><h2>Appearance</h2><ThemeControl /></article></section><AdminSettings /><div className="review-actions"><Link href="/admin/apps/new">Back to store manager</Link></div></main></>;
}
