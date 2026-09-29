import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyIconBytes, managedIconPath } from '../lib/admin/icon-upload.ts';

test('managedIconPath accepts only owner-managed icon locations', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(managedIconPath(`https://x.supabase.co/storage/v1/object/public/app-icons/admin/${id}.png`, 'https://x.supabase.co'), `admin/${id}.png`);
  assert.equal(managedIconPath(`https://x.supabase.co/storage/v1/object/public/app-icons/admin-icons/${id}.webp`, 'https://x.supabase.co'), `admin-icons/${id}.webp`);
  assert.equal(managedIconPath('https://evil.example/icon.png', 'https://x.supabase.co'), null);
  assert.equal(managedIconPath(`https://x.supabase.co/storage/v1/object/public/app-icons/../../bad.png`, 'https://x.supabase.co'), null);
});

test('classifyIconBytes checks real image signatures', () => {
  assert.equal(classifyIconBytes(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])), 'png');
  assert.equal(classifyIconBytes(Uint8Array.from([0xff,0xd8,0xff,0xe0])), 'jpg');
  assert.equal(classifyIconBytes(Uint8Array.from([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50])), 'webp');
  assert.equal(classifyIconBytes(new TextEncoder().encode('<script>alert(1)</script>')), null);
});
