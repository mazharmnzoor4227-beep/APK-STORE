import Link from 'next/link';
import { Header } from '../../../components/header';
import { QueueManager } from '../../../components/queue-manager';

export default function QueuePage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / UPLOADS</span><h1>Queue</h1><p>Review upload and inspection jobs, retry inspection, cancel active uploads, discard review jobs and inspect history.</p><div className="review-actions"><Link href="/admin/apps/new">Back to store manager</Link></div><QueueManager /></main></>;
}
