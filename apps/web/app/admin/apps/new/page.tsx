import Link from 'next/link';
import { Header } from '../../../../components/header';
import { UploadForm } from '../../../../components/upload-form';
import { ReviewPanel } from '../../../../components/review-panel';
import { ManageApps } from '../../../../components/manage-apps';

export default function NewAppPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / APK STORE</span><h1>Manage your store<span className="green-dot">.</span></h1><p>Upload third-party or owner-listed apps here, review detected APK identity, then publish or save a private draft. APK STORE itself now has a separate release channel so client updates cannot be mixed up with general catalog publishing.</p><div className="review-actions"><Link className="action-button" href="/admin/store-release">APK STORE release</Link><Link href="/admin/crashes">Crash reports</Link><Link href="/admin/trash">Trash</Link><Link href="/admin/queue">Queue</Link><Link href="/admin/settings">Settings</Link></div><div id="review-uploads"><UploadForm /><ReviewPanel /></div><ManageApps /></main></>;
}
