import { Header } from '../../../../components/header';
import { UploadForm } from '../../../../components/upload-form';
import { ReviewPanel } from '../../../../components/review-panel';
import { ManageApps } from '../../../../components/manage-apps';

export default function NewAppPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / APK STORE</span><h1>Manage your store<span className="green-dot">.</span></h1><p>Upload an APK, review its detected package ID, version and signature, then approve it. A matching package updates its existing listing. Use the app list to edit icons, hide apps and publish them again.</p><div id="review-uploads"><UploadForm /><ReviewPanel /></div><ManageApps /></main></>;
}
