import Link from 'next/link';
import { Header } from '../../../components/header';
import { TrashManager } from '../../../components/trash-manager';

export default function TrashPage() {
  return <><Header /><main className="site-container admin-page"><span className="section-index">OWNER / CATALOG</span><h1>Trash</h1><p>Restore apps as hidden listings or permanently remove an app and its managed APK/icon/screenshot objects after exact-name confirmation.</p><div className="review-actions"><Link href="/admin/apps/new">Back to store manager</Link></div><TrashManager /></main></>;
}
