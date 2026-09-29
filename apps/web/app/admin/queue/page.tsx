import Link from 'next/link';
import { Header } from '../../../components/header';

export default function QueuePage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / UPLOADS</span><h1>Queue</h1><p>Review upload and inspection jobs, retry recoverable failures, cancel active work and inspect history.</p><div className="review-actions"><Link href="/admin/apps/new">Back to store manager</Link></div><div id="queue-manager" className="empty-state"><h3>Loading upload queue…</h3><p>The owner-only queue will appear here after authentication.</p></div></main></>;
}
