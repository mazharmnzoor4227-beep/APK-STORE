'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type App = { id: string; slug: string; title: string; package_id: string; category: string; description: string;
  icon_url: string | null; visibility: string; release: { version_code: number; version_name: string } | null };

export function ManageApps() {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<App[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return;
    const client = createClient(url, key);
    client.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ''));
  }, []);

  async function refresh(accessToken = token) {
    if (!accessToken) { setMessage('Sign in to manage apps.'); return; }
    const response = await fetch('/api/admin/apps', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load apps');
    setApps(result.apps);
    setMessage(`${result.apps.length} apps loaded. Refresh APK STORE to see published changes.`);
  }

  async function update(app: App, changes: Record<string, string>) {
    setBusy(app.id); setMessage('Saving…');
    try {
      const response = await fetch(`/api/admin/apps/${app.id}`, { method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save');
      await refresh();
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
      const upload = await fetch(target.signedUrl, { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
      if (!upload.ok) throw new Error('Icon upload failed');
      await update(app, { iconUrl: target.iconUrl });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Icon upload failed'); }
    finally { setBusy(''); }
  }

  return <section className="manage-list" aria-label="Manage published apps">
    <div className="review-heading"><div><span className="section-index">OWNER / CATALOG</span><h2>Manage apps</h2></div>
      <button type="button" onClick={() => { setOpen(!open); if (!open) refresh().catch(error => setMessage(error.message)); }}>{open ? 'Close list' : 'Open app list'}</button></div>
    {open && <><button type="button" onClick={() => refresh().catch(error => setMessage(error.message))}>Refresh catalog status</button>
      <p role="status">{message}</p>
      {apps.map(app => <article className="managed-app" key={app.id}>
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
          <a href={`#review-uploads`}>Upload update</a></div>
      </article>)}
    </>}
  </section>;
}
