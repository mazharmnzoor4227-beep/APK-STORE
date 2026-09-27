'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

function uploadWithProgress(url: string, file: File, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('content-type', 'application/vnd.android.package-archive');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(event.loaded / event.total); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
    xhr.onerror = () => reject(new Error('Network interrupted. Select the file and retry.'));
    xhr.send(file);
  });
}

export function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!file) return;
    setBusy(true); setMessage(''); setProgress(0);
    try {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) throw new Error('Owner sign-in is not configured.');
      const client = createClient(url, key);
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Sign in first to upload.');
      const authorization = { Authorization: `Bearer ${session.access_token}` };
      const start = await fetch('/api/admin/uploads', { method: 'POST', headers: { ...authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: file.name, byteSize: file.size }) });
      const candidate = await start.json();
      if (!start.ok) throw new Error(candidate.error || 'Could not prepare upload');
      await uploadWithProgress(candidate.signedUrl, file, setProgress);
      const complete = await fetch(`/api/admin/uploads/${candidate.id}/complete`, { method: 'POST', headers: authorization });
      const result = await complete.json();
      if (!complete.ok) throw new Error(result.error || 'Could not confirm upload');
      setMessage(result.inspection === 'queued' ? 'APK uploaded. Inspection is queued; review it in the admin panel when ready.' : 'APK uploaded, but inspection is not configured yet. It has not been published.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed'); }
    finally { setBusy(false); }
  }
  return <form className="admin-form" onSubmit={submit}><label htmlFor="apk-file">Android APK file</label><input id="apk-file" type="file" accept=".apk,application/vnd.android.package-archive" required onChange={event => setFile(event.target.files?.[0] || null)} /><span className="field-help">Maximum 50 MB on the connected free storage. The file stays private until you approve publication.</span>{busy && <progress aria-label="Upload progress" value={progress} max="1" /> }<button className="action-button" disabled={busy || !file} type="submit">{busy ? `Uploading ${Math.round(progress * 100)}%` : 'Upload for review'}</button><p role="status">{message}</p><Link href="/admin/login">Need to sign in?</Link></form>;
}
