import Link from 'next/link';
import { Header } from '../../../components/header';

export default function TrashPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / CATALOG</span><h1>Trash</h1><p>Restore or permanently remove apps that were moved out of the live catalog.</p><div className="review-actions"><Link href="/admin/apps/new">Back to store manager</Link></div><div id="trash-manager" className="empty-state"><h3>Loading trashed apps…</h3><p>The owner-only trash manager will appear here after authentication.</p></div></main></>;
}
