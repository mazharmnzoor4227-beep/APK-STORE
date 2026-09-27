'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) { setMessage('Sign-in is not configured yet.'); setBusy(false); return; }
    const client = createClient(url, key);
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/admin/apps/new` } });
    setMessage(error ? error.message : 'Check your email for the sign-in link.'); setBusy(false);
  }
  return <form className="admin-form" onSubmit={submit}><label htmlFor="email">Owner email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /><button className="action-button" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send sign-in link'}</button><p role="status">{message}</p></form>;
}
