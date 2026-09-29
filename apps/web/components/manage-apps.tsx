'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { cropSquareIcon } from '../lib/client/image-crop';

type App = {
  id: string; slug: string; title: string; package_id: string; category: string; description: string; short_description: string;
  icon_url: string | null; screenshots: string[]; license: string; source_url: string; fdroid_url: string; price_type: string;
  is_recommended: boolean; min_sdk?: number | null; visibility: string; updated_at?: string;
  release: { version_code: number; version_name: string; byte_size?: number; apk_sha256?: string; certificate_sha256?: string; release_notes?: string } | null;
};

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
    createClient(url, key).auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ''));
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
    setApps(result.apps ?? []); setMessage(`${result.apps?.length ?? 0} apps loaded.`);
  }

  async function update(app: App, changes: Record<string, unknown>) {
    setBusy(app.id); setMessage('Saving…');
    try {
      const response = await fetch(`/api/admin/apps/${app.id}`, { method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save');
      await refresh(); setMessage(`${app.title} saved.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save'); }
    finally { setBusy(''); }
  }

  async function changeIcon(app: App, file?: File) {
    if (!file) return;
    setBusy(app.id); setMessage('Cropping and verifying icon…');
    try {
      const cropped = await cropSquareIcon(file);
      const start = await fetch('/api/admin/icons', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: cropped.name, byteSize: cropped.size }) });
      const target = await start.json();
      if (!start.ok) throw new Error(target.error || 'Icon upload failed');
      const upload = await fetch(target.signedUrl, { method: 'PUT', headers: { 'Content-Type': cropped.type, 'x-upsert': 'false' }, body: cropped });
      if (!upload.ok) throw new Error('Icon upload failed');
      await update(app, { iconUrl: target.iconUrl });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Icon upload failed'); }
    finally { setBusy(''); }
  }

  async function addScreenshots(app: App, files: FileList | null) {
    if (!files?.length) return;
    const current = app.screenshots ?? [];
    if (current.length + files.length > 8) { setMessage('Use up to 8 screenshots.'); return; }
    setBusy(app.id); setMessage('Uploading screenshots…');
    try {
      const next = [...current];
      for (const file of Array.from(files)) {
        const form = new FormData(); form.set('file', file);
        const response = await fetch('/api/admin/screenshots', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Screenshot upload failed');
        next.push(result.screenshotUrl);
      }
      await update(app, { screenshots: next });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Screenshot upload failed'); }
    finally { setBusy(''); }
  }

  async function moveScreenshot(app: App, index: number, direction: -1 | 1) {
    const next = [...(app.screenshots ?? [])]; const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await update(app, { screenshots: next });
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
      await refresh(); setMessage(`${app.title} moved to Trash.`);
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
        <div className="managed-app-heading">{app.icon_url ? <img src={app.icon_url} alt="" width="64" height="64" /> : <span className="managed-placeholder">{app.title.slice(0, 1)}</span>}<div><h3>{app.title}</h3><p>{app.package_id}<br />{app.release ? `Version ${app.release.version_name} (${app.release.version_code})` : 'No release'} · {app.visibility}</p></div></div>
        <details><summary>Edit details, icon and screenshots</summary>
          <form className="admin-form" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); update(app, {
            title: String(data.get('title')), category: String(data.get('category')), description: String(data.get('description')),
            short_description: String(data.get('short_description')), license: String(data.get('license')),
            source_url: String(data.get('source_url')), fdroid_url: String(data.get('fdroid_url')),
            price_type: String(data.get('price_type')), is_recommended: data.get('is_recommended') === 'on',
          }); }}>
            <label>App name<input name="title" required defaultValue={app.title} maxLength={120} /></label>
            <label>Short description<input name="short_description" defaultValue={app.short_description ?? ''} maxLength={80} /></label>
            <label>Category<input name="category" required defaultValue={app.category} maxLength={80} /></label>
            <label>Description<textarea name="description" defaultValue={app.description} maxLength={5000} /></label>
            <label>License<input name="license" defaultValue={app.license ?? ''} maxLength={80} /></label>
            <label>Source URL<input name="source_url" type="url" defaultValue={app.source_url ?? ''} /></label>
            <label>F-Droid URL<input name="fdroid_url" type="url" defaultValue={app.fdroid_url ?? ''} /></label>
            <label>Price type<select name="price_type" defaultValue={app.price_type ?? 'Free'}><option>Free</option><option>In-app purchases</option><option>In-app purchases or Paid</option></select></label>
            <label><input name="is_recommended" type="checkbox" defaultChecked={app.is_recommended} /> Recommended</label>
            <button className="action-button" disabled={busy === app.id}>Save details</button>
          </form>
          <label className="icon-upload">Replace / crop icon (PNG, WebP, JPG under 300 KB)<input type="file" accept="image/png,image/webp,image/jpeg" disabled={busy === app.id} onChange={event => changeIcon(app, event.target.files?.[0])} /></label>
          <fieldset><legend>Screenshots</legend><input aria-label={`Add screenshots for ${app.title}`} type="file" accept="image/webp" multiple disabled={busy === app.id} onChange={event => addScreenshots(app, event.target.files)} />
            {(app.screenshots ?? []).map((url, index) => <div className="review-actions" key={url}><img src={url} alt={`Screenshot ${index + 1}`} width="64" height="96" /><button type="button" disabled={busy === app.id || index === 0} onClick={() => moveScreenshot(app, index, -1)}>Move up</button><button type="button" disabled={busy === app.id || index === app.screenshots.length - 1} onClick={() => moveScreenshot(app, index, 1)}>Move down</button><button type="button" disabled={busy === app.id} onClick={() => update(app, { screenshots: app.screenshots.filter((_, position) => position !== index) })}>Remove</button></div>)}
          </fieldset>
        </details>
        <div className="review-actions"><button type="button" disabled={busy === app.id} onClick={() => update(app, { visibility: app.visibility === 'published' ? 'unlisted' : 'published' })}>{app.visibility === 'published' ? 'Hide from store' : 'Publish in store'}</button>
          <a href="#review-uploads">New version</a><button type="button" onClick={() => copy(app.package_id, 'Package ID')}>Copy package ID</button><button type="button" onClick={() => copy(`${window.location.origin}/api/download/${app.slug}`, 'Download link')}>Copy download link</button><a href={`/apps/${app.slug}`} target="_blank" rel="noreferrer">Open in store ↗</a><button type="button" disabled={busy === app.id} onClick={() => moveToTrash(app)}>Delete</button></div>
      </article>)}
      {shown.length === 0 && <div className="empty-state"><h3>No matching apps</h3><p>Change the search or visibility filter.</p></div>}
    </>}
  </section>;
}
