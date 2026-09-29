'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type StoreStatus = {
  identity: { package_id: string; slug: string; signer_sha256: string; configured_at: string };
  app: { id: string; title: string; visibility: string; deleted_at: string | null; current_release_id: string | null } | null;
  release: { version_code: number; version_name: string; certificate_sha256: string; apk_sha256: string; byte_size: number; status: string; published_at: string | null } | null;
  candidates: Array<{ id: string; filename: string; status: string; created_at: string; error: string | null; inspection: { versionCode?: number; versionName?: string; certificateSha256?: string } | null }>;
};

export function StoreUpdateStatus() {
  const [data, setData] = useState<StoreStatus | null>(null);
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('Loading APK STORE release status…');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');

  async function load(accessToken: string) {
    const response = await fetch('/api/admin/store-status', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Release status unavailable');
    setData(result); setMessage('');
  }

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage('Owner sign-in is not configured.'); return; }
    createClient(url, key).auth.getSession().then(async ({ data: sessionData }) => {
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) { setMessage('Sign in as the owner to view APK STORE release status.'); return; }
      setToken(accessToken);
      try { await load(accessToken); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Release status unavailable'); }
    });
  }, []);

  async function publish(candidateId: string) {
    if (!token) return;
    setBusy(candidateId); setMessage('Publishing verified APK STORE release…');
    try {
      const response = await fetch('/api/admin/store-release', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId, releaseNotes: notes[candidateId] ?? '' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Publish failed');
      await load(token);
      setMessage(`APK STORE versionCode ${result.versionCode} published. Installed copies will see it on their next manual/background check.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Publish failed'); }
    finally { setBusy(''); }
  }

  return <section className="review-list" aria-label="APK STORE release identity">
    <div className="review-heading"><div><span className="section-index">OWNER / STORE UPDATE</span><h2>APK STORE release</h2></div><button type="button" disabled={!token} onClick={() => token && load(token).catch(error => setMessage(error.message))}>Refresh release status</button></div>
    <p role="status">{message}</p>
    {data && <>
      <dl className="inspection-details">
        <div><dt>Package ID</dt><dd>{data.identity.package_id}</dd></div>
        <div><dt>Store slug</dt><dd>{data.identity.slug}</dd></div>
        <div><dt>Permanent signer</dt><dd>{data.identity.signer_sha256}</dd></div>
        <div><dt>Catalog state</dt><dd>{data.app ? (data.app.deleted_at ? 'Pre-release row in trash' : data.app.visibility) : 'Not published'}</dd></div>
        <div><dt>Current catalog version</dt><dd>{data.release ? `${data.release.version_name} (${data.release.version_code})` : 'None'}</dd></div>
        <div><dt>Current signer match</dt><dd>{data.release ? (data.release.certificate_sha256 === data.identity.signer_sha256 ? 'Yes' : 'No · old test signer') : '—'}</dd></div>
      </dl>
      <p>This is the separate first-party release channel. Only <code>{data.identity.package_id}</code>, the permanent signer, and a strictly higher integer versionCode can be published here.</p>
      {!data.candidates.length && <div className="empty-state"><h3>No APK STORE upload is waiting</h3><p>Upload the permanently signed APK below. After inspection succeeds it will appear here for publishing.</p></div>}
      {!!data.candidates.length && <div className="review-item"><h3>APK STORE uploads</h3>
        {data.candidates.map(candidate => <div key={candidate.id} className="managed-app"><p><strong>{candidate.filename}</strong> · {candidate.status} · {candidate.inspection?.versionName ?? 'not inspected'} {candidate.inspection?.versionCode ? `(${candidate.inspection.versionCode})` : ''}</p>{candidate.error && <p role="alert">{candidate.error}</p>}{candidate.status === 'inspected' && <><label>What&apos;s new<textarea value={notes[candidate.id] ?? ''} maxLength={5000} onChange={event => setNotes(current => ({ ...current, [candidate.id]: event.target.value }))} /></label><button className="action-button" type="button" disabled={busy === candidate.id} onClick={() => publish(candidate.id)}>Publish APK STORE update</button></>}</div>)}
      </div>}
    </>}
  </section>;
}
