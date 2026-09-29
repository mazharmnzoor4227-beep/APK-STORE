import test from 'node:test';
import assert from 'node:assert/strict';
import { durableIconPath, extensionForContentType } from './icon-storage.mjs';

test('maps allowed image content types to stable extensions', () => {
  assert.equal(extensionForContentType('image/png'), 'png');
  assert.equal(extensionForContentType('image/jpeg'), 'jpg');
  assert.equal(extensionForContentType('image/webp'), 'webp');
  assert.equal(extensionForContentType('text/html'), null);
});

test('builds immutable-safe app scoped storage path', () => {
  assert.equal(durableIconPath('e1d467a0-e438-4dd7-afe1-f5e81236635b', 'image/webp'),
    'proxy/e1d467a0-e438-4dd7-afe1-f5e81236635b.webp');
});

test('rejects malformed app ids', () => {
  assert.equal(durableIconPath('../escape', 'image/png'), null);
});
