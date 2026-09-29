'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type TrashApp = { id: string; slug: string; title: string; package_id: string; icon_url: string | null; visibility: string; deleted_at: string; updated_at: string };

export function TrashManager() {
  const [apps, setApps] = useState<TrashApp[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('Sign in to load Trash.');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key);
    supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token ?? '';
      setToken(accessToken);
      if (accessToken) refresh(accessToken).catch(error => setMessage(error instanceof Error ? error.message : 'Trash unavailable'));
    });
  }, []);

  async function refresh(accessToken = token) {
    if (!accessToken) { setMessage('Sign in as the owner to view Trash.'); return; }
    setMessage('Loading Trash…');
    const response = await fetch('/api/admin/trash', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Trash unavailable');
    setApps(result.apps ?? []);
    setMessage(result.apps?.length ? `${result.apps.length} trashed app${result.apps.length === 1 ? '' : 's'}.` : 'Trash is empty.');
  }

  async function restore(app: TrashApp) {
    if (!token) return;
    setBusy(app.id); setMessage(`Restoring ${app.title}…`);
    try {
      const response = await fetch(`/api/admin/trash/${app.id}`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Restore failed');
      await refresh();
      setMessage(`${app.title} restored as hidden. Publish it again when ready.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Restore failed'); }
    finally { setBusy(''); }
  }

  async function purgeRequest(app: TrashApp) {
    const response = await fetch(`/api/admin/trash/${app.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: app.title }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Permanent deletion failed for ${app.title}`);
  }

  async function purge(app: TrashApp) {
    if (!token) return;
    const typed = window.prompt(`Delete forever cannot be undone. Type exactly: ${app.title}`);
    if (typed !== app.title) { setMessage('Permanent deletion cancelled. App name did not match.'); return; }
    setBusy(app.id); setMessage(`Permanently deleting ${app.title} and its stored files…`);
    try {
      await purgeRequest(app);
      await refresh();
      setMessage(`${app.title} was permanently deleted.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Permanent deletion failed'); }
    finally { setBusy(''); }
  }

  async function emptyTrash() {
    if (!token) { setMessage('Sign in as the owner first.'); return; }
    if (!apps.length) { setMessage('Trash is already empty.'); return; }
    const typed = window.prompt(`This permanently deletes ${apps.length} app(s) and their managed APK/icon/screenshot files. Type EMPTY TRASH to continue.`);
    if (typed !== 'EMPTY TRASH') { setMessage('Empty trash cancelled.'); return; }
    setBusy('all');
    try {
      for (let index = 0; index < apps.length; index++) {
        const app = apps[index];
        setMessage(`Deleting ${index + 1} of ${apps.length}: ${app.title}…`);
        await purgeRequest(app);
      }
      await refresh();
      setMessage('Trash emptied.');
    } catch (error) {
      await refresh().catch(() => undefined);
      setMessage(error instanceof Error ? `${error.message}. Remaining items were kept.` : 'Empty trash stopped; remaining items were kept.');
    } finally { setBusy(''); }
  }

  return <section className="review-list" aria-label="Trash manager">
    <div className="review-heading"><div><span className="section-index">OWNER / TRASH</span><h2>Deleted apps</h2></div><div className="review-actions"><button type="button" onClick={() => refresh().catch(error => setMessage(error.message))}>Refresh trash</button><button type="button" disabled={busy === 'all' || apps.length === 0} onClick={emptyTrash}>Empty trash</button></div></div>
    <p role="status">{message}</p>
    {apps.map(app => <article className="managed-app" key={app.id}><div className="managed-app-heading">{app.icon_url ? <img src={app.icon_url} alt="" width="56" height="56" /> : <span className="managed-placeholder">{app.title.slice(0, 1)}</span>}<div><h3>{app.title}</h3><p>{app.package_id}<br />Deleted {new Date(app.deleted_at).toLocaleString()}</p></div></div><div className="review-actions"><button type="button" disabled={Boolean(busy)} onClick={() => restore(app)}>Restore hidden</button><button type="button" disabled={Boolean(busy)} onClick={() => purge(app)}>Delete forever</button></div></article>)}
  </section>;
}
