'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Owner sign-in is not configured.');
  return createClient(url, key);
}

type ThemeChoice = 'system' | 'dark' | 'light';
function applyTheme(choice: ThemeChoice) {
  const light = choice === 'light' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
}

export function AdminSettings() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [theme, setTheme] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = window.localStorage.getItem('apk-store-admin-theme');
    const choice: ThemeChoice = stored === 'light' || stored === 'dark' ? stored : 'system';
    setTheme(choice); applyTheme(choice);
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const update = () => { if ((window.localStorage.getItem('apk-store-admin-theme') ?? 'system') === 'system') applyTheme('system'); };
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

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
      setPassword(''); setMessage('Password changed. Use the new password next time you sign in.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Password change failed'); }
    finally { setBusy(''); }
  }

  async function validateCatalog() {
    setBusy('catalog'); setMessage('Refreshing owner catalog view…');
    try {
      const { token } = await sessionToken();
      const response = await fetch(`/api/admin/apps?refresh=${Date.now()}`, { headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Catalog refresh failed');
      const published = Array.isArray(result.apps) ? result.apps.filter((app: { visibility?: string }) => app.visibility === 'published').length : 0;
      setMessage(`Fresh catalog read complete. ${published} published app${published === 1 ? '' : 's'} found. Android clients receive changes on their next foreground/background refresh.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Catalog refresh failed'); }
    finally { setBusy(''); }
  }

  function changeTheme(next: ThemeChoice) {
    setTheme(next);
    window.localStorage.setItem('apk-store-admin-theme', next);
    applyTheme(next);
    setMessage(`Theme preference saved: ${next}.`);
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
    <article className="review-item"><h2>Catalog</h2><p>The storefront reads published Supabase rows directly; Android refreshes them on foreground/background checks.</p><button type="button" disabled={busy === 'catalog'} onClick={validateCatalog}>Validate live catalog</button></article>
    <article className="review-item"><h2>Appearance</h2><label htmlFor="admin-theme">Admin theme</label><select id="admin-theme" value={theme} onChange={event => changeTheme(event.target.value as ThemeChoice)}><option value="system">System</option><option value="dark">Dark</option><option value="light">Light</option></select><p>Saved on this browser and restored on future admin visits.</p></article>
    <article className="review-item"><h2>Session</h2><button type="button" disabled={busy === 'signout'} onClick={signOut}>Sign out</button></article>
    <p role="status">{message}</p>
  </section>;
}
