'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { cropSquareIcon } from '../lib/client/image-crop';

type ReviewDraft = {
  slug?: string; title?: string; category?: string; description?: string; shortDescription?: string;
  releaseNotes?: string; license?: string; sourceUrl?: string; fdroidUrl?: string; priceType?: string;
  recommended?: boolean; iconUrl?: string; screenshots?: string[];
};
type ExistingApp = {
  id: string; slug: string; title: string; category: string; description: string; short_description?: string;
  license?: string; source_url?: string; fdroid_url?: string; price_type?: string; is_recommended?: boolean;
  screenshots?: string[]; icon_url?: string | null; min_sdk?: number | null;
};
type Candidate = {
  id: string; filename: string; status: string; error: string | null;
  inspection: { packageId: string; versionCode: number; versionName: string; certificateSha256: string; apkSha256?: string;
    iconUrl?: string; appName?: string; minSdk?: number; targetSdk?: number; permissions?: string[]; abis?: string[]; draft?: ReviewDraft } | null;
  existingApp: ExistingApp | null;
};

async function uploadIcon(file: File, token: string): Promise<string> {
  const cropped = await cropSquareIcon(file);
  const start = await fetch('/api/admin/icons', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: cropped.name, byteSize: cropped.size }) });
  const target = await start.json();
  if (!start.ok) throw new Error(target.error || 'Could not prepare icon upload');
  const upload = await fetch(target.signedUrl, { method: 'PUT', headers: { 'Content-Type': cropped.type, 'x-upsert': 'false' }, body: cropped });
  if (!upload.ok) throw new Error('Icon upload failed');
  return target.iconUrl;
}

async function uploadScreenshot(file: File, token: string): Promise<string> {
  const form = new FormData(); form.set('file', file);
  const response = await fetch('/api/admin/screenshots', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Screenshot upload failed');
  return result.screenshotUrl;
}

export function ReviewPanel() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState('');
  const [screenshots, setScreenshots] = useState<Record<string, string[]>>({});
  const [iconUrls, setIconUrls] = useState<Record<string, string>>({});

  async function refresh(accessToken: string) {
    const response = await fetch('/api/admin/candidates', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    const candidates = result.candidates as Candidate[];
    setItems(candidates);
    setScreenshots(current => {
      const next = { ...current };
      for (const item of candidates) if (next[item.id] === undefined)
        next[item.id] = [...(item.inspection?.draft?.screenshots ?? item.existingApp?.screenshots ?? [])];
      return next;
    });
    setIconUrls(current => {
      const next = { ...current };
      for (const item of candidates) if (next[item.id] === undefined)
        next[item.id] = item.inspection?.draft?.iconUrl ?? item.inspection?.iconUrl ?? item.existingApp?.icon_url ?? '';
      return next;
    });
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
    const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('data-action') || 'approve';
    const form = new FormData(event.currentTarget);
    setBusyId(item.id);
    setMessage(action === 'approve' ? 'Publishing release…' : action === 'draft' ? 'Saving hidden draft…' : 'Rejecting upload…');
    try {
      if (action === 'reject') {
        const response = await fetch(`/api/admin/candidates/${item.id}/review`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject' }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Reject failed');
        setMessage('Upload rejected. Use Queue to discard its stored file if needed.');
        await refresh(token); return;
      }
      const replacement = form.get('icon');
      const iconUrl = replacement instanceof File && replacement.size ? await uploadIcon(replacement, token) : (iconUrls[item.id] || item.inspection?.iconUrl || '');
      setIconUrls(current => ({ ...current, [item.id]: iconUrl }));
      const response = await fetch(`/api/admin/candidates/${item.id}/review`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, targetAppId: item.existingApp?.id ?? null,
          slug: form.get('slug'), title: form.get('title'), category: form.get('category'),
          description: form.get('description'), shortDescription: form.get('shortDescription'),
          releaseNotes: form.get('releaseNotes'), packageId: form.get('packageId'), iconUrl,
          license: form.get('license'), sourceUrl: form.get('sourceUrl'), fdroidUrl: form.get('fdroidUrl'),
          priceType: form.get('priceType'), recommended: form.get('recommended') === 'on',
          screenshots: screenshots[item.id] ?? [],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Review failed');
      setMessage(result.warning || (action === 'draft' ? 'Draft saved privately. It is not visible in the store.' : 'Release published. Refresh the store catalog to see it.'));
      await refresh(token);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review failed'); }
    finally { setBusyId(''); }
  }

  async function retryInspection(item: Candidate) {
    setBusyId(item.id); setMessage('Requesting APK inspection…');
    try {
      const response = await fetch(`/api/admin/candidates/${item.id}/inspect`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Inspection unavailable');
      setMessage('Inspection queued. Refresh this panel when it completes.'); await refresh(token);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Inspection unavailable'); }
    finally { setBusyId(''); }
  }

  async function discard(item: Candidate) {
    if (!window.confirm(`Discard ${item.filename} and remove its uploaded APK file?`)) return;
    setBusyId(item.id); setMessage('Discarding uploaded files…');
    try {
      const response = await fetch(`/api/admin/uploads/${item.id}/discard`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Discard failed');
      setMessage('Upload discarded and temporary APK storage cleaned.'); await refresh(token);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Discard failed'); }
    finally { setBusyId(''); }
  }

  async function addScreenshots(item: Candidate, files: FileList | null) {
    if (!files?.length) return;
    const existing = screenshots[item.id] ?? [];
    if (existing.length + files.length > 8) { setMessage('Use up to 8 screenshots.'); return; }
    setBusyId(item.id); setMessage('Uploading screenshots…');
    try {
      const next = [...existing];
      for (const file of Array.from(files)) next.push(await uploadScreenshot(file, token));
      setScreenshots(current => ({ ...current, [item.id]: next }));
      setMessage('Screenshots uploaded. Save draft or publish to persist this order.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Screenshot upload failed'); }
    finally { setBusyId(''); }
  }

  function moveScreenshot(item: Candidate, index: number, direction: -1 | 1) {
    setScreenshots(current => {
      const next = [...(current[item.id] ?? [])]; const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...current, [item.id]: next };
    });
  }

  return <section className="review-list" id="review-uploads" aria-label="Upload reviews">
    <div className="review-heading"><div><span className="section-index">OWNER / RELEASES</span><h2>Review uploads</h2></div><button type="button" onClick={() => token && refresh(token).catch(error => setMessage(error.message))} disabled={!token}>Refresh status</button></div>
    <p role="status">{message}</p>
    {!items.length && token && <div className="empty-state"><h3>No uploads yet</h3><p>Upload an APK above to start a new app or prepare an update.</p></div>}
    {items.map(item => {
      const draft = item.inspection?.draft ?? {};
      const packageId = item.inspection?.packageId ?? '';
      const activeScreenshots = screenshots[item.id] ?? [];
      return <article className="review-item" key={item.id}>
        <div className="review-item-heading"><div><span className="section-index">{item.existingApp ? 'UPDATE' : 'NEW APP'} / {item.status.toUpperCase()}</span><h3>{item.filename}</h3></div><span className="review-status">{item.status}</span></div>
        {item.error && <p role="alert">{item.error}</p>}
        {item.inspection && <dl className="inspection-details"><div><dt>Package ID</dt><dd>{packageId}</dd></div><div><dt>Version</dt><dd>{item.inspection.versionName} ({item.inspection.versionCode})</dd></div><div><dt>Signing SHA-256</dt><dd>{item.inspection.certificateSha256}</dd></div><div><dt>APK SHA-256</dt><dd>{item.inspection.apkSha256 || 'verified during inspection'}</dd></div><div><dt>SDK</dt><dd>min {item.inspection.minSdk ?? '—'} · target {item.inspection.targetSdk ?? '—'}</dd></div></dl>}
        {item.existingApp && <p className="update-note">This package matches <strong>{item.existingApp.title}</strong>. Approval publishes a new version only after signer and version-code checks pass.</p>}
        {item.status === 'uploaded' && <div className="inspection-pending"><p>The APK is private until inspection and your approval are complete.</p><button type="button" disabled={busyId === item.id} onClick={() => retryInspection(item)}>Retry inspection</button></div>}
        {item.status === 'inspected' && <form className="admin-form" onSubmit={event => review(event, item)}>
          <label htmlFor={`package-${item.id}`}>Package ID · detected from APK</label><input id={`package-${item.id}`} name="packageId" readOnly value={packageId} />
          <span className="field-help">Detected values are locked. Editable catalog fields below may be changed before saving or publishing.</span>
          <label htmlFor={`title-${item.id}`}>App name<input id={`title-${item.id}`} name="title" required maxLength={120} defaultValue={draft.title ?? item.existingApp?.title ?? item.inspection?.appName ?? ''} /></label>
          <label htmlFor={`short-${item.id}`}>Short description<input id={`short-${item.id}`} name="shortDescription" maxLength={80} defaultValue={draft.shortDescription ?? item.existingApp?.short_description ?? ''} /></label>
          <label htmlFor={`icon-${item.id}`}>Replace / crop icon<input id={`icon-${item.id}`} name="icon" type="file" accept="image/png,image/webp,image/jpeg" /></label>
          <span className="field-help">Replacement images are center-cropped to a square. The verified APK icon remains the reset/default icon.</span>
          <div className="review-actions"><button type="button" onClick={() => setIconUrls(current => ({ ...current, [item.id]: item.inspection?.iconUrl ?? '' }))}>Reset to APK icon</button></div>
          {(iconUrls[item.id] || item.inspection?.iconUrl) && <img src={iconUrls[item.id] || item.inspection?.iconUrl} alt="Selected app icon" width="72" height="72" />}
          <label htmlFor={`slug-${item.id}`}>Store URL<input id={`slug-${item.id}`} name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={draft.slug ?? item.existingApp?.slug ?? packageId.replaceAll('.', '-').toLowerCase()} /></label>
          <label htmlFor={`category-${item.id}`}>Category<input id={`category-${item.id}`} name="category" required maxLength={80} defaultValue={draft.category ?? item.existingApp?.category ?? 'Tools'} /></label>
          <label htmlFor={`description-${item.id}`}>Description<textarea id={`description-${item.id}`} name="description" maxLength={5000} defaultValue={draft.description ?? item.existingApp?.description ?? ''} /></label>
          <label htmlFor={`notes-${item.id}`}>What's new / release notes<textarea id={`notes-${item.id}`} name="releaseNotes" maxLength={5000} defaultValue={draft.releaseNotes ?? ''} /></label>
          <label htmlFor={`license-${item.id}`}>License<input id={`license-${item.id}`} name="license" maxLength={80} defaultValue={draft.license ?? item.existingApp?.license ?? ''} /></label>
          <label htmlFor={`source-${item.id}`}>Source code URL<input id={`source-${item.id}`} name="sourceUrl" type="url" defaultValue={draft.sourceUrl ?? item.existingApp?.source_url ?? ''} /></label>
          <label htmlFor={`fdroid-${item.id}`}>F-Droid URL<input id={`fdroid-${item.id}`} name="fdroidUrl" type="url" defaultValue={draft.fdroidUrl ?? item.existingApp?.fdroid_url ?? ''} /></label>
          <label htmlFor={`price-${item.id}`}>Price type<select id={`price-${item.id}`} name="priceType" defaultValue={draft.priceType ?? item.existingApp?.price_type ?? 'Free'}><option>Free</option><option>In-app purchases</option><option>In-app purchases or Paid</option></select></label>
          <label><input name="recommended" type="checkbox" defaultChecked={draft.recommended ?? item.existingApp?.is_recommended ?? false} /> Recommended</label>
          <fieldset><legend>Screenshots · WebP up to 300 KB each</legend>
            <input aria-label={`Add screenshots for ${item.filename}`} type="file" accept="image/webp" multiple disabled={busyId === item.id} onChange={event => addScreenshots(item, event.target.files)} />
            {activeScreenshots.map((url, index) => <div className="review-actions" key={url}><img src={url} alt={`Screenshot ${index + 1}`} width="64" height="96" /><button type="button" disabled={index === 0} onClick={() => moveScreenshot(item, index, -1)}>Move up</button><button type="button" disabled={index === activeScreenshots.length - 1} onClick={() => moveScreenshot(item, index, 1)}>Move down</button><button type="button" onClick={() => setScreenshots(current => ({ ...current, [item.id]: (current[item.id] ?? []).filter((_, position) => position !== index) }))}>Remove</button></div>)}
          </fieldset>
          <div className="review-actions"><button className="action-button" disabled={busyId === item.id} type="submit">{item.existingApp ? 'Approve update' : 'Approve and publish'}</button><button disabled={busyId === item.id} type="submit" data-action="draft">Save draft</button><button disabled={busyId === item.id} type="submit" data-action="reject" formNoValidate>Reject</button><button disabled={busyId === item.id} type="button" onClick={() => discard(item)}>Discard files</button></div>
        </form>}
      </article>;
    })}
  </section>;
}
