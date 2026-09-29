'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type App = { id: string; slug: string; title: string; package_id: string; category: string; description: string;
  icon_url: string | null; visibility: string; updated_at?: string; release: { version_code: number; version_name: string } | null };

export function ManageApps() {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<App[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [sort, setSort] = useState('updated');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const client = createClient(url, key);
    client.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ''));
  }, []);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return apps.filter(app => visibility === 'all' || app.visibility === visibility)
      .filter(app => !needle || [app.title, app.package_id, app.category, app.slug].some(value => value.toLowerCase().includes(needle)))
      .sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
  }, [apps, query, visibility, sort]);

  async function refresh(accessToken = token) {
    if (!accessToken) { setMessage('Sign in to manage apps.'); return; }
    const response = await fetch('/api/admin/apps', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load apps');
    setApps(result.apps ?? []);
    setMessage(`${result.apps?.length ?? 0} apps loaded.`);
  }

  async function update(app: App, changes: Record<string, string>) {
    setBusy(app.id); setMessage('Saving…');
    try {
      const response = await fetch(`/api/admin/apps/${app.id}`, { method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save');
      await refresh();
      setMessage(`${app.title} saved.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save'); }
    finally { setBusy(''); }
  }

  async function changeIcon(app: App, file?: File) {
    if (!file) return;
    setBusy(app.id); setMessage('Uploading icon…');
    try {
      const start = await fetch('/api/admin/icons', { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, byteSize: file.size }) });
      const target = await start.json();
      if (!start.ok) throw new Error(target.error || 'Icon upload failed');
      const upload = await fetch(target.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
      if (!upload.ok) throw new Error('Icon upload failed');
      await update(app, { iconUrl: target.iconUrl });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Icon upload failed'); }
    finally { setBusy(''); }
  }

  async function copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); setMessage(`${label} copied.`); }
    catch { setMessage(`Could not copy ${label.toLowerCase()}.`); }
  }

  async function moveToTrash(app: App) {
    if (!token) return;
    const typed = window.prompt(`Move this app to Trash? Type exactly: ${app.title}`);
    if (typed !== app.title) { setMessage('Delete cancelled. App name did not match.'); return; }
    setBusy(app.id); setMessage(`Moving ${app.title} to Trash…`);
    try {
      const response = await fetch(`/api/admin/apps/${app.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: typed }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Delete failed');
      await refresh();
      setMessage(`${app.title} moved to Trash.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Delete failed'); }
    finally { setBusy(''); }
  }

  return <section className="manage-list" aria-label="Manage published apps">
    <div className="review-heading"><div><span className="section-index">OWNER / CATALOG</span><h2>Manage apps</h2></div>
      <button type="button" onClick={() => { setOpen(!open); if (!open) refresh().catch(error => setMessage(error.message)); }}>{open ? 'Close list' : 'Open app list'}</button></div>
    {open && <><div className="review-actions"><button type="button" onClick={() => refresh().catch(error => setMessage(error.message))}>Refresh catalog status</button></div>
      <div className="admin-form"><label>Search apps<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, package, category" /></label><label>Visibility<select value={visibility} onChange={event => setVisibility(event.target.value)}><option value="all">All</option><option value="published">Published</option><option value="unlisted">Hidden</option></select></label><label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="updated">Recently updated</option><option value="title">App name</option></select></label></div>
      <p role="status">{message}</p>
      {shown.map(app => <article className="managed-app" key={app.id}>
        <div className="managed-app-heading">
          {app.icon_url ? <img src={app.icon_url} alt="" width="64" height="64" /> : <span className="managed-placeholder">{app.title.slice(0, 1)}</span>}
          <div><h3>{app.title}</h3><p>{app.package_id}<br />{app.release ? `Version ${app.release.version_name} (${app.release.version_code})` : 'No release'} · {app.visibility}</p></div>
        </div>
        <details><summary>Edit details and icon</summary>
          <form className="admin-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget);
            update(app, { title: String(data.get('title')), category: String(data.get('category')), description: String(data.get('description')) }); }}>
            <label>App name<input name="title" required defaultValue={app.title} maxLength={120} /></label>
            <label>Category<input name="category" required defaultValue={app.category} maxLength={80} /></label>
            <label>Description<textarea name="description" defaultValue={app.description} maxLength={5000} /></label>
            <button className="action-button" disabled={busy === app.id}>Save details</button>
          </form>
          <label className="icon-upload">Change icon (PNG, WebP, JPG under 300 KB)
            <input type="file" accept="image/png,image/webp,image/jpeg" disabled={busy === app.id}
              onChange={event => changeIcon(app, event.target.files?.[0])} /></label>
        </details>
        <div className="review-actions"><button type="button" disabled={busy === app.id}
          onClick={() => update(app, { visibility: app.visibility === 'published' ? 'unlisted' : 'published' })}>
          {app.visibility === 'published' ? 'Hide from store' : 'Publish in store'}</button>
          <a href="#review-uploads">New version</a>
          <button type="button" onClick={() => copy(app.package_id, 'Package ID')}>Copy package ID</button>
          <button type="button" onClick={() => copy(`${window.location.origin}/api/download/${app.slug}`, 'Download link')}>Copy download link</button>
          <a href={`/apps/${app.slug}`} target="_blank" rel="noreferrer">Open in store ↗</a>
          <button type="button" disabled={busy === app.id} onClick={() => moveToTrash(app)}>Delete</button></div>
      </article>)}
      {shown.length === 0 && <div className="empty-state"><h3>No matching apps</h3><p>Change the search or visibility filter.</p></div>}
    </>}
  </section>;
}
