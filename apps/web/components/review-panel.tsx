'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type ExistingApp = { id: string; slug: string; title: string; category: string; description: string };
type Candidate = {
  id: string; filename: string; status: string; error: string | null;
  inspection: { packageId: string; versionCode: number; versionName: string; certificateSha256: string } | null;
  existingApp: ExistingApp | null;
};

async function uploadIcon(file: File, token: string): Promise<string> {
  const start = await fetch('/api/admin/icons', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, byteSize: file.size }) });
  const target = await start.json();
  if (!start.ok) throw new Error(target.error || 'Could not prepare icon upload');
  const upload = await fetch(target.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'image/png', 'x-upsert': 'false' }, body: file });
  if (!upload.ok) throw new Error('Icon upload failed');
  return target.iconUrl;
}

export function ReviewPanel() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');

  async function refresh(accessToken: string) {
    const response = await fetch('/api/admin/candidates', { headers: { Authorization: `Bearer ${accessToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setItems(result.candidates);
  }

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage('Owner sign-in is not configured.'); return; }
    createClient(url, key).auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) { setMessage('Sign in to review your uploads.'); return; }
      setToken(accessToken);
      refresh(accessToken).catch(error => setMessage(error.message));
    });
  }, []);

  async function review(event: React.FormEvent<HTMLFormElement>, item: Candidate) {
    event.preventDefault();
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action') === 'reject' ? 'reject' : 'approve';
    const form = new FormData(event.currentTarget);
    setBusyId(item.id);
    setMessage(action === 'approve' ? 'Publishing release…' : 'Rejecting upload…');
    try {
      const icon = form.get('icon');
      const iconUrl = action === 'approve' && icon instanceof File && icon.size ? await uploadIcon(icon, token) : '';
      const response = await fetch(`/api/admin/candidates/${item.id}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, targetAppId: item.existingApp?.id ?? null,
          slug: form.get('slug'), title: form.get('title'), category: form.get('category'),
          description: form.get('description'), releaseNotes: form.get('releaseNotes'),
          packageId: form.get('packageId'), iconUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Review failed');
      setMessage(result.warning || (action === 'approve' ? 'Release published. Refresh the store catalog to see it.' : 'Upload rejected.'));
      await refresh(token);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review failed'); }
    finally { setBusyId(''); }
  }

  async function retryInspection(item: Candidate) {
    setBusyId(item.id); setMessage('Requesting APK inspection…');
    try {
      const response = await fetch(`/api/admin/candidates/${item.id}/inspect`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Inspection unavailable');
      setMessage('Inspection queued. Refresh this panel when it completes.');
      await refresh(token);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Inspection unavailable'); }
    finally { setBusyId(''); }
  }

  return <section className="review-list" aria-label="Upload reviews">
    <div className="review-heading"><div><span className="section-index">OWNER / RELEASES</span><h2>Review uploads</h2></div><button type="button" onClick={() => token && refresh(token).catch(error => setMessage(error.message))} disabled={!token}>Refresh status</button></div>
    <p role="status">{message}</p>
    {!items.length && token && <div className="empty-state"><h3>No uploads yet</h3><p>Upload an APK above to start a new app or prepare an update.</p></div>}
    {items.map(item => <article className="review-item" key={item.id}>
      <div className="review-item-heading"><div><span className="section-index">{item.existingApp ? 'UPDATE' : 'NEW APP'} / {item.status.toUpperCase()}</span><h3>{item.filename}</h3></div><span className="review-status">{item.status}</span></div>
      {item.error && <p role="alert">{item.error}</p>}
      {item.inspection && <dl className="inspection-details"><div><dt>Package ID</dt><dd>{item.inspection.packageId}</dd></div><div><dt>Version</dt><dd>{item.inspection.versionName} ({item.inspection.versionCode})</dd></div><div><dt>Signing SHA-256</dt><dd>{item.inspection.certificateSha256}</dd></div></dl>}
      {item.existingApp && <p className="update-note">This package matches <strong>{item.existingApp.title}</strong>. Approval will publish a new version of that app after the version and signing checks pass.</p>}
      {item.status === 'uploaded' && <div className="inspection-pending"><p>The APK is private until inspection and your approval are complete.</p><button type="button" disabled={busyId === item.id} onClick={() => retryInspection(item)}>Retry inspection</button></div>}
      {item.status === 'inspected' && <form className="admin-form" onSubmit={event => review(event, item)}>
        <label htmlFor={`package-${item.id}`}>Package ID (detected from APK)</label><input id={`package-${item.id}`} name="packageId" required defaultValue={item.inspection?.packageId ?? ''} pattern="[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+" />
        <span className="field-help">You may edit this field, but it must match the inspected APK. A matching package updates the same app when its signing certificate matches and version code increases.</span>
        <label htmlFor={`title-${item.id}`}>App name</label><input id={`title-${item.id}`} name="title" required maxLength={120} defaultValue={item.existingApp?.title ?? ''} />
        <label htmlFor={`icon-${item.id}`}>App icon</label><input id={`icon-${item.id}`} name="icon" type="file" accept="image/png,image/webp,image/jpeg" />
        <span className="field-help">PNG, WebP, or JPG, up to 300 KB. Upload an icon for new apps.</span>
        <label htmlFor={`slug-${item.id}`}>Store URL</label><input id={`slug-${item.id}`} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={item.existingApp?.slug ?? ''} />
        <label htmlFor={`category-${item.id}`}>Category</label><input id={`category-${item.id}`} name="category" required maxLength={80} defaultValue={item.existingApp?.category ?? ''} />
        <label htmlFor={`description-${item.id}`}>Description</label><textarea id={`description-${item.id}`} name="description" maxLength={5000} defaultValue={item.existingApp?.description ?? ''} />
        <label htmlFor={`notes-${item.id}`}>What changed in this version?</label><textarea id={`notes-${item.id}`} name="releaseNotes" maxLength={5000} />
        <div className="review-actions"><button className="action-button" disabled={busyId === item.id} type="submit">{item.existingApp ? 'Approve update' : 'Approve and publish'}</button><button disabled={busyId === item.id} type="submit" data-action="reject" formNoValidate>Reject</button></div>
      </form>}
    </article>)}
  </section>;
}
