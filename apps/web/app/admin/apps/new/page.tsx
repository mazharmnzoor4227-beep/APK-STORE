import { Header } from '../../../../components/header';
import { UploadForm } from '../../../../components/upload-form';

export default function NewAppPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / NEW RELEASE</span><h1>Upload an APK<span className="green-dot">.</span></h1><p>Package information is extracted from the APK after upload. Nothing is published until you review and approve it.</p><UploadForm /></main></>;
}
