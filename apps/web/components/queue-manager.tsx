'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type Candidate = { id: string; filename: string; byte_size: number; status: string; error: string | null; inspection: Record<string, unknown> | null; created_at: string };

export function QueueManager() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [token, setToken] = useState('');
  const [filter, setFilter] = useState('all');
  const [message, setMessage] = useState('Sign in to load the upload queue.');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    createClient(url, key).auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token ?? '';
      setToken(accessToken);
      if (accessToken) refresh(accessToken).catch(error => setMessage(error instanceof Error ? error.message : 'Queue unavailable'));
    });
  }, []);

  const shown = useMemo(() => filter === 'all' ? items : items.filter(item => item.status === filter), [items, filter]);
  const counts = useMemo(() => items.reduce<Record<string, number>>((result, item) => { result[item.status] = (result[item.status] ?? 0) + 1; return result; }, {}), [items]);
  const history = useMemo(() => items.filter(item => ['published','rejected','invalid'].includes(item.status)), [items]);

  async function refresh(accessToken = token) {
    if (!accessToken) { setMessage('Sign in as the owner to view the queue.'); return; }
    setMessage('Loading queue…');
    const response = await fetch('/api/admin/candidates', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Queue unavailable');
    setItems(result.candidates ?? []);
    setMessage(`${result.candidates?.length ?? 0} upload job${(result.candidates?.length ?? 0) === 1 ? '' : 's'} loaded.`);
  }

  async function action(item: Candidate, kind: 'inspect' | 'cancel' | 'discard') {
    if (!token) return;
    setBusy(item.id); setMessage(`${kind === 'inspect' ? 'Queuing inspection' : kind === 'cancel' ? 'Cancelling upload' : 'Discarding upload'}…`);
    try {
      const endpoint = kind === 'inspect' ? `/api/admin/candidates/${item.id}/inspect` : `/api/admin/uploads/${item.id}/${kind}`;
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${kind} failed`);
      await refresh();
      setMessage(kind === 'inspect' ? 'Inspection queued.' : kind === 'cancel' ? 'Upload cancelled.' : 'Upload discarded.');
    } catch (error) { setMessage(error instanceof Error ? error.message : `${kind} failed`); }
    finally { setBusy(''); }
  }

  const option = (status: string, label: string) => <option value={status}>{label} ({status === 'all' ? items.length : counts[status] ?? 0})</option>;

  return <section className="review-list" aria-label="Upload queue manager">
    <div className="review-heading"><div><span className="section-index">OWNER / QUEUE</span><h2>Upload jobs</h2></div><button type="button" onClick={() => refresh().catch(error => setMessage(error.message))}>Refresh queue</button></div>
    <label>Queue status<select aria-label="Queue status" value={filter} onChange={event => setFilter(event.target.value)}>{option('all','All')}{option('uploading','Uploading')}{option('uploaded','Uploaded')}{option('inspected','Inspected')}{option('invalid','Invalid')}{option('published','Published')}{option('rejected','Rejected')}</select></label>
    <p role="status">{message}</p>
    {shown.map(item => <article className="review-item" key={item.id}><div className="review-item-heading"><div><span className="section-index">{item.status.toUpperCase()}</span><h3>{item.filename}</h3></div><span className="review-status">{Math.max(1, Math.round(item.byte_size / 1024 / 1024))} MB</span></div><p>Created {new Date(item.created_at).toLocaleString()}</p>{item.error && <p>{item.error}</p>}<div className="review-actions">{item.status === 'uploaded' && <button type="button" disabled={busy === item.id} onClick={() => action(item, 'inspect')}>{item.error ? 'Retry inspection' : 'Re-inspect'}</button>}{item.status === 'uploading' && <button type="button" disabled={busy === item.id} onClick={() => action(item, 'cancel')}>Cancel</button>}{['uploaded','inspected'].includes(item.status) && <button type="button" disabled={busy === item.id} onClick={() => action(item, 'discard')}>Discard</button>}</div></article>)}
    <details><summary>History ({history.length})</summary>{history.length === 0 ? <p>No completed jobs yet.</p> : history.map(item => <p key={`history-${item.id}`}>{item.filename} · {item.status} · {new Date(item.created_at).toLocaleString()}</p>)}</details>
  </section>;
}
