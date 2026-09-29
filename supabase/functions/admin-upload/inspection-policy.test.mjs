import test from 'node:test';
import assert from 'node:assert/strict';
import { hasRequiredIcon, managedMediaPath } from './inspection-policy.mjs';

test('inspection cannot publish without extracted icon URL', () => {
  assert.equal(hasRequiredIcon({ packageId: 'com.example.app' }), false);
  assert.equal(hasRequiredIcon({ iconUrl: '' }), false);
  assert.equal(hasRequiredIcon({ iconUrl: 'https://example.supabase.co/storage/v1/object/public/app-icons/a.png' }), true);
});

test('permanent cleanup accepts current and legacy owner icon paths only', () => {
  const id = '123e4567-e89b-12d3-a456-426614174000';
  assert.equal(managedMediaPath(`admin/${id}.png`), true);
  assert.equal(managedMediaPath(`admin-icons/${id}.webp`), true);
  assert.equal(managedMediaPath(`${id}.jpg`), true);
  assert.equal(managedMediaPath(`admin/${id}.gif`), false);
  assert.equal(managedMediaPath(`admin-icons/${id}/extra.png`), false);
  assert.equal(managedMediaPath('../../secret.png'), false);
  assert.equal(managedMediaPath('admin/not-a-uuid.png'), false);
});
