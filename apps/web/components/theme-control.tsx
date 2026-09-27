'use client';

import { useEffect, useState } from 'react';

type ThemeChoice = 'light' | 'dark' | 'system';

function applyTheme(choice: ThemeChoice) {
  const effective = choice === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : choice;
  document.documentElement.dataset.theme = effective;
}

export function ThemeControl() {
  const [choice, setChoice] = useState<ThemeChoice>('dark');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('apk-store-theme');
    const initial: ThemeChoice = saved === 'light' || saved === 'system' ? saved : 'dark';
    setChoice(initial);
    applyTheme(initial);
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (choice === 'system') applyTheme('system'); };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  function select(next: ThemeChoice) {
    window.localStorage.setItem('apk-store-theme', next);
    setChoice(next);
    applyTheme(next);
    setOpen(false);
  }

  return <div className="theme-wrap">
    <button type="button" className="theme-trigger" aria-label="Theme" aria-expanded={open} onClick={() => setOpen(!open)}><span aria-hidden="true">◐</span><span className="theme-label">Theme</span><span aria-hidden="true">⌄</span></button>
    {open && <div className="theme-menu" role="listbox" aria-label="Theme preference">{(['light', 'dark', 'system'] as const).map(item => <button type="button" role="option" aria-selected={choice === item} key={item} onClick={() => select(item)}>{item[0].toUpperCase() + item.slice(1)}{choice === item && <span aria-hidden="true">✓</span>}</button>)}</div>}
  </div>;
}
