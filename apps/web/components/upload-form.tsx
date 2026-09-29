'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

function uploadWithProgress(url: string, file: File, onProgress: (fraction: number) => void, onCreate: (xhr: XMLHttpRequest) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onCreate(xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/vnd.android.package-archive');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Network interrupted. Select the file and retry.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    xhr.send(file);
  });
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const candidateRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  async function cancelUpload() {
    if (!busy) return;
    cancelledRef.current = true;
    xhrRef.current?.abort();
    const id = candidateRef.current;
    const token = tokenRef.current;
    if (id && token) {
      try {
        await fetch(`/api/admin/uploads/${id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      } catch { /* the aborted browser upload is already stopped */ }
    }
    setBusy(false);
    setMessage('Upload cancelled. The pending upload was cleaned up.');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true); setMessage(''); setProgress(0);
    candidateRef.current = null; cancelledRef.current = false;
    try {
      if (file.size > 300 * 1024 * 1024) throw new Error('APK exceeds the 300 MB upload limit.');
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
      await uploadWithProgress(candidate.signedUrl, file, setProgress, xhr => { xhrRef.current = xhr; });
      if (cancelledRef.current) return;
      setMessage('Upload complete. Inspecting APK metadata and launcher icon…');
      const complete = await fetch(`/api/admin/uploads/${candidate.id}/complete`, { method: 'POST', headers: authorization });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error || 'Could not inspect upload');
      setProgress(1);
      setMessage('APK uploaded and inspected. Review the extracted details and icon before publishing.');
    } catch (error) {
      if (!cancelledRef.current) setMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      xhrRef.current = null; tokenRef.current = null; candidateRef.current = null;
      setBusy(false);
    }
  }

  return <form className="admin-form" onSubmit={submit}><label htmlFor="apk-file">Android APK file</label><input id="apk-file" type="file" accept=".apk,application/vnd.android.package-archive" required disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} /><span className="field-help">Maximum 300 MB. Large APKs use the private R2 upload path and stay private until you approve publication.</span>{busy && <progress aria-label="Upload progress" value={progress} max="1" /> }<button className="action-button" disabled={busy || !file} type="submit">{busy ? `Uploading ${Math.round(progress * 100)}%` : 'Upload for review'}</button>{busy && <button className="secondary-button" type="button" onClick={cancelUpload}>Cancel upload</button>}<p role="status">{message}</p><Link href="/admin/login">Need to sign in?</Link></form>;
}
