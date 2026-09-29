'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type CrashStatus = 'open' | 'resolved' | 'ignored';
type CrashEvent = {
  version_code: number; version_name: string; android_sdk: number;
  device_manufacturer: string; device_model: string; exception_class: string;
  message: string; stack_trace: string; occurred_at: string; received_at: string;
};
type CrashIssue = {
  fingerprint: string; title: string; exception_class: string; status: CrashStatus;
  first_seen_at: string; last_seen_at: string; event_count: number;
  latest_version_code: number; latest_version_name: string;
  versions: string[]; androidVersions: string[]; deviceModels: string[]; latestEvent: CrashEvent | null;
};
type CrashResponse = {
  summary: { openCount: number; recentReports: number; issueCount: number };
  issues: CrashIssue[];
};

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
}

export function CrashDashboard() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<CrashResponse | null>(null);
  const [message, setMessage] = useState('Loading crash reports…');
  const [busy, setBusy] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatusFilter] = useState<'all' | CrashStatus>('all');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.issues ?? []).filter(issue => status === 'all' || issue.status === status).filter(issue => {
      if (!needle) return true;
      return [issue.title, issue.exception_class, issue.latest_version_name, issue.fingerprint,
        issue.latestEvent?.message ?? '', ...issue.deviceModels, ...issue.androidVersions, ...issue.versions]
        .some(value => value.toLowerCase().includes(needle));
    });
  }, [data, query, status]);

  async function refresh(accessToken: string) {
    const response = await fetch('/api/admin/crashes', { headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Crash reports unavailable');
    setData(result); setMessage('');
  }

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage('Owner sign-in is not configured.'); return; }
    createClient(url, key).auth.getSession().then(({ data: sessionData }) => {
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) { setMessage('Sign in as the owner to view crash reports.'); return; }
      setToken(accessToken);
      refresh(accessToken).catch(error => setMessage(error instanceof Error ? error.message : 'Crash reports unavailable'));
    });
  }, []);

  async function setStatus(issue: CrashIssue, next: CrashStatus) {
    if (!token || issue.status === next) return;
    setBusy(issue.fingerprint); setMessage(`Marking diagnostic ${next}…`);
    try {
      const response = await fetch(`/api/admin/crashes/${issue.fingerprint}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not update diagnostic status');
      await refresh(token);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update diagnostic status'); }
    finally { setBusy(''); }
  }

  return <section className="review-list" aria-label="APK STORE crash reports">
    <div className="review-heading"><div><span className="section-index">OWNER / STABILITY</span><h2>Crash & error reports</h2></div><button type="button" disabled={!token} onClick={() => token && refresh(token).catch(error => setMessage(error.message))}>Refresh</button></div>
    <p role="status">{message}</p>
    {data && <dl className="inspection-details"><div><dt>Open issues</dt><dd>{data.summary.openCount}</dd></div><div><dt>Reports · 7 days</dt><dd>{data.summary.recentReports}</dd></div><div><dt>Total issue groups</dt><dd>{data.summary.issueCount}</dd></div></dl>}
    <div className="admin-form"><label>Search diagnostics<input aria-label="Search diagnostics" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Exception, device, version, message" /></label><label>Status<select aria-label="Diagnostic status" value={status} onChange={event => setStatusFilter(event.target.value as 'all' | CrashStatus)}><option value="all">All</option><option value="open">Open</option><option value="resolved">Resolved</option><option value="ignored">Ignored</option></select></label></div>
    {data && data.issues.length === 0 && <div className="empty-state"><h3>No diagnostics reported</h3><p>Crashes and important handled errors will appear here after the app uploads its private queue on a successful launch.</p></div>}
    {data && data.issues.length > 0 && shown.length === 0 && <div className="empty-state"><h3>No matching diagnostics</h3><p>Change the search text or status filter.</p></div>}
    {shown.map(issue => <article className="review-item" key={issue.fingerprint}>
      <div className="review-item-heading"><div><span className="section-index">{issue.status.toUpperCase()} / {issue.event_count} REPORT{issue.event_count === 1 ? '' : 'S'}</span><h3>{issue.title}</h3></div><span className="review-status">{issue.status}</span></div>
      <dl className="inspection-details"><div><dt>Latest version</dt><dd>{issue.latest_version_name} ({issue.latest_version_code})</dd></div><div><dt>First seen</dt><dd>{when(issue.first_seen_at)}</dd></div><div><dt>Last seen</dt><dd>{when(issue.last_seen_at)}</dd></div><div><dt>Fingerprint</dt><dd>{issue.fingerprint.slice(0, 16)}…</dd></div></dl>
      {!!issue.versions.length && <p><strong>Versions:</strong> {issue.versions.join(', ')}</p>}
      {!!issue.androidVersions.length && <p><strong>Android:</strong> {issue.androidVersions.join(', ')}</p>}
      {!!issue.deviceModels.length && <p><strong>Devices:</strong> {issue.deviceModels.join(', ')}</p>}
      {issue.latestEvent && <details><summary>Latest sanitized stack trace</summary><p>{issue.latestEvent.message || 'No exception message'}</p><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 420, overflow: 'auto' }}>{issue.latestEvent.stack_trace}</pre></details>}
      <div className="review-actions"><button type="button" className="action-button" disabled={busy === issue.fingerprint || issue.status === 'open'} onClick={() => setStatus(issue, 'open')}>Re-open</button><button type="button" disabled={busy === issue.fingerprint || issue.status === 'resolved'} onClick={() => setStatus(issue, 'resolved')}>Resolve</button><button type="button" disabled={busy === issue.fingerprint || issue.status === 'ignored'} onClick={() => setStatus(issue, 'ignored')}>Ignore</button></div>
    </article>)}
  </section>;
}
