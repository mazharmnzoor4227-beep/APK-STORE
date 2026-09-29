import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyScreenshotBytes, managedScreenshotPath } from '../lib/admin/screenshot-upload.ts';

test('only real WebP screenshot bytes are accepted', () => {
  const webp = new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]);
  assert.equal(classifyScreenshotBytes(webp), 'webp');
  assert.equal(classifyScreenshotBytes(new TextEncoder().encode('<script>alert(1)</script>')), null);
});

test('managed screenshot path cannot escape the owner prefix', () => {
  const base = 'https://demo.supabase.co';
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(managedScreenshotPath(`${base}/storage/v1/object/public/app-screenshots/admin/${id}.webp`, base), `admin/${id}.webp`);
  assert.equal(managedScreenshotPath(`${base}/storage/v1/object/public/app-screenshots/../../secret.webp`, base), null);
  assert.equal(managedScreenshotPath('https://evil.example/a.webp', base), null);
});
