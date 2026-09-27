'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Candidate = { id: string; filename: string; status: string; error: string | null; inspection: { packageId: string; versionCode: number; versionName: string; certificateSha256: string } | null };
export function ReviewPanel() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  async function refresh(accessToken: string) {
    const response = await fetch('/api/admin/candidates', { headers: { Authorization: `Bearer ${accessToken}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setItems(result.candidates);
  }
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage('Owner sign-in is not configured.'); return; }
    createClient(url, key).auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) { setMessage('Sign in to review your uploads.'); return; }
      setToken(accessToken); refresh(accessToken).catch(error => setMessage(error.message));
    });
  }, []);
  async function review(event: React.FormEvent<HTMLFormElement>, id: string, action: 'approve' | 'reject') {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage('Saving review…');
    const response = await fetch(`/api/admin/candidates/${id}/review`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action, slug: form.get('slug'), title: form.get('title'), category: form.get('category'), description: form.get('description'), releaseNotes: form.get('releaseNotes') }) });
    const result = await response.json();
    setMessage(response.ok ? action === 'approve' ? 'Published successfully.' : 'Rejected.' : result.error);
    if (response.ok) await refresh(token);
  }
  return <section className="review-list" aria-label="Upload reviews"><h2>Review uploads</h2><p role="status">{message}</p>{items.map(item => <article className="review-item" key={item.id}><h3>{item.filename}</h3><p>Status: {item.status}{item.error ? ` — ${item.error}` : ''}</p>{item.inspection && <p>Package: {item.inspection.packageId} · Version: {item.inspection.versionName} ({item.inspection.versionCode})<br />Signing SHA-256: {item.inspection.certificateSha256}</p>}{item.status === 'inspected' && <form className="admin-form" onSubmit={event => review(event, item.id, (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action') === 'reject' ? 'reject' : 'approve')}><label>App name<input name="title" required maxLength={120} /></label><label>URL slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" /></label><label>Category<input name="category" required maxLength={80} /></label><label>Description<input name="description" /></label><label>Release notes<input name="releaseNotes" /></label><button className="action-button" type="submit">Approve and publish</button><button type="submit" data-action="reject" formNoValidate>Reject</button></form>}</article>)}</section>;
}
