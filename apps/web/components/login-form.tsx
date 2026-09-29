'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) {
      setMessage('Sign-in is not configured yet.');
      setBusy(false);
      return;
    }
    const client = createClient(url, key);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(error.message);
      setBusy(false);
      return;
    }
    window.location.assign('/admin/apps/new');
  }

  return <form className="admin-form" onSubmit={submit}>
    <label htmlFor="email">Owner email</label>
    <input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} />
    <label htmlFor="password">Password</label>
    <input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
    <button className="action-button" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
    <p role="status">{message}</p>
  </form>;
}
