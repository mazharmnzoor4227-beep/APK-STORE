import Link from 'next/link';
import { Header } from '../../../components/header';
import { StoreUpdateStatus } from '../../../components/store-update-status';
import { UploadForm } from '../../../components/upload-form';
import { ReviewPanel } from '../../../components/review-panel';

export default function StoreReleasePage() {
  return <><Header /><main className="site-container admin-page">
    <span className="section-index">OWNER / FIRST-PARTY RELEASE</span>
    <h1>APK STORE releases<span className="green-dot">.</span></h1>
    <p>This page is only for shipping the APK STORE Android client. Upload the permanently signed APK here, wait for inspection, then publish it from the release card. The server blocks the wrong package ID, wrong signer, or a non-increasing versionCode.</p>
    <div className="review-actions"><Link href="/admin/apps/new">Third-party app catalog</Link><Link href="/admin/settings">Settings</Link></div>
    <StoreUpdateStatus />
    <section className="review-list"><div className="review-heading"><div><span className="section-index">STEP 1</span><h2>Upload signed APK STORE APK</h2></div></div><UploadForm /></section>
    <details><summary>Inspection details / troubleshooting</summary><ReviewPanel /></details>
  </main></>;
}
