'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

function uploadWithProgress(url: string, file: File, onProgress: (fraction: number) => void, onXhr: (xhr: XMLHttpRequest) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onXhr(xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/vnd.android.package-archive');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Network interrupted. Select the file and retry.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    xhr.send(file);
  });
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const candidateRef = useRef<string>('');
  const tokenRef = useRef<string>('');

  function choose(next?: File | null) {
    if (!next) return;
    if (!/\.apk$/i.test(next.name) || next.size < 1 || next.size > 300 * 1024 * 1024) {
      setFile(null); setMessage('Choose an APK up to 300 MB.'); return;
    }
    setFile(next); setMessage(''); setProgress(0);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setMessage('Preparing private upload…'); setProgress(0);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new Error('Owner sign-in is not configured.');
      const client = createClient(url, key);
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Sign in first to upload.');
      tokenRef.current = session.access_token;
      const authorization = { Authorization: `Bearer ${session.access_token}` };
      const start = await fetch('/api/admin/uploads', { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, byteSize: file.size }) });
      const candidate = await start.json();
      if (!start.ok) throw new Error(candidate.error || 'Could not prepare upload');
      candidateRef.current = candidate.id;
      setMessage(file.size > 50 * 1024 * 1024 ? 'Uploading to large-file storage…' : 'Uploading privately…');
      await uploadWithProgress(candidate.signedUrl, file, setProgress, xhr => { xhrRef.current = xhr; });
      xhrRef.current = null;
      const complete = await fetch(`/api/admin/uploads/${candidate.id}/complete`, { method: 'POST', headers: authorization });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error || 'Could not confirm upload');
      candidateRef.current = '';
      setProgress(1);
      setMessage(result.inspection === 'queued' ? 'APK uploaded. Inspection is queued; review it when ready.' : 'APK uploaded. Inspection is waiting for the inspection service.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') setMessage('Upload cancelled.');
      else setMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally { xhrRef.current = null; setBusy(false); }
  }

  async function cancelUpload() {
    xhrRef.current?.abort();
    const id = candidateRef.current;
    const token = tokenRef.current;
    candidateRef.current = '';
    setBusy(false); setProgress(0); setMessage('Cancelling upload…');
    if (!id || !token) { setMessage('Upload cancelled.'); return; }
    try {
      const response = await fetch(`/api/admin/uploads/${id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok && response.status !== 409) throw new Error(result.error || 'Cancel failed');
      setMessage('Upload cancelled and temporary storage cleaned up.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload cancelled locally; temporary cleanup needs retry.'); }
  }

  return <form className="admin-form" onSubmit={submit}>
    <label htmlFor="apk-file">Android APK file</label>
    <div role="button" tabIndex={0} className="upload-dropzone" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); choose(event.dataTransfer.files?.[0]); }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') document.getElementById('apk-file')?.click(); }}>
      <strong>Drop an APK here</strong><span> or choose a file below</span>
    </div>
    <input id="apk-file" type="file" accept=".apk,application/vnd.android.package-archive" required disabled={busy} onChange={event => choose(event.target.files?.[0] || null)} />
    <span className="field-help">Maximum 300 MB. Smaller APKs use private Supabase storage; larger APKs use configured R2 storage. Nothing is published until you approve it.</span>
    {file && <span className="field-help">Selected: {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB</span>}
    {busy && <progress aria-label="Upload progress" value={progress} max="1" />}
    <div className="review-actions"><button className="action-button" disabled={busy || !file} type="submit">{busy ? `Uploading ${Math.round(progress * 100)}%` : 'Upload for review'}</button><button type="button" disabled={!busy} onClick={cancelUpload}>Cancel upload</button></div>
    <p role="status">{message}</p><Link href="/admin/login">Need to sign in?</Link>
  </form>;
}
