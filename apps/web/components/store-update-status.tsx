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
  const [message, setMessage] = useState('Loading APK STORE release status…');

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage('Owner sign-in is not configured.'); return; }
    createClient(url, key).auth.getSession().then(async ({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      if (!token) { setMessage('Sign in as the owner to view APK STORE release status.'); return; }
      try {
        const response = await fetch('/api/admin/store-status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Release status unavailable');
        setData(result);
        setMessage('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Release status unavailable');
      }
    });
  }, []);

  return <section className="review-list" aria-label="APK STORE release identity">
    <div className="review-heading"><div><span className="section-index">OWNER / STORE UPDATE</span><h2>APK STORE release</h2></div></div>
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
      <p>The permanent package ID, slug, and release certificate are locked server-side. Future public APK STORE releases must use this signer and a higher integer version code.</p>
      {!!data.candidates.length && <div className="review-item">
        <h3>Pending APK STORE uploads</h3>
        {data.candidates.map(candidate => <p key={candidate.id}><strong>{candidate.filename}</strong> · {candidate.status} · {candidate.inspection?.versionName ?? 'not inspected'} {candidate.inspection?.versionCode ? `(${candidate.inspection.versionCode})` : ''}</p>)}
      </div>}
    </>}
  </section>;
}
