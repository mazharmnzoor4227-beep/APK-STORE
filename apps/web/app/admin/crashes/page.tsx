import Link from 'next/link';
import { Header } from '../../../components/header';
import { CrashDashboard } from '../../../components/crash-dashboard';

export default function CrashesPage() {
  return <><Header /><main className="site-container admin-page">
    <span className="section-index">OWNER / APK STORE</span>
    <h1>App stability<span className="green-dot">.</span></h1>
    <p>Review first-party technical crash reports from APK STORE. Reports are grouped by a stable crash fingerprint and contain only the diagnostic fields described in the app privacy policy.</p>
    <div className="review-actions"><Link className="action-button" href="/admin/apps/new">Back to store management</Link></div>
    <CrashDashboard />
  </main></>;
}
