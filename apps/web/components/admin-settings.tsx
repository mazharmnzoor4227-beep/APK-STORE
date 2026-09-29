'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Owner sign-in is not configured.');
  return createClient(url, key);
}

export function AdminSettings() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  async function sessionToken() {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Sign in as the owner first.');
    return { supabase, token: session.access_token };
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) { setMessage('Use at least 8 characters.'); return; }
    setBusy('password'); setMessage('Changing password…');
    try {
      const { supabase } = await sessionToken();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword(''); setMessage('Password changed.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password change failed'); }
    finally { setBusy(''); }
  }

  async function validateCatalog() {
    setBusy('catalog'); setMessage('Validating live catalog…');
    try {
      const { token } = await sessionToken();
      const response = await fetch('/api/admin/apps', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Catalog validation failed');
      const published = Array.isArray(result.apps) ? result.apps.filter((app: { visibility?: string }) => app.visibility === 'published').length : 0;
      setMessage(`Live catalog is reachable. ${published} published app${published === 1 ? '' : 's'} found.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Catalog validation failed'); }
    finally { setBusy(''); }
  }

  async function signOut() {
    setBusy('signout'); setMessage('Signing out…');
    try {
      const supabase = client();
      await supabase.auth.signOut();
      window.location.assign('/admin/login');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Sign out failed'); setBusy(''); }
  }

  return <section className="review-list" aria-label="Owner settings controls">
    <article className="review-item"><h2>Owner password</h2><form className="admin-form" onSubmit={changePassword}><label htmlFor="new-password">New password</label><input id="new-password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} /><button type="submit" disabled={busy === 'password'}>Change password</button></form></article>
    <article className="review-item"><h2>Catalog</h2><p>The public storefront reads the published Supabase catalog directly. This check confirms the owner API and current published rows are reachable.</p><button type="button" disabled={busy === 'catalog'} onClick={validateCatalog}>Validate live catalog</button></article>
    <article className="review-item"><h2>Session</h2><button type="button" disabled={busy === 'signout'} onClick={signOut}>Sign out</button></article>
    <p role="status">{message}</p>
  </section>;
}
