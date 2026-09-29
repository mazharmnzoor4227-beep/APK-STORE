import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStoreRelease } from '../lib/admin/store-release-policy.ts';

const signer = 'a'.repeat(64);

test('store release requires permanent package signer and higher version', () => {
  assert.equal(validateStoreRelease({ packageId: 'com.apkstore.client', certificateSha256: signer, versionCode: 14 }, { packageId: 'com.apkstore.client', signerSha256: signer, currentVersionCode: 13 }), null);
  assert.match(validateStoreRelease({ packageId: 'bad.app', certificateSha256: signer, versionCode: 14 }, { packageId: 'com.apkstore.client', signerSha256: signer, currentVersionCode: 13 }) ?? '', /package/i);
  assert.match(validateStoreRelease({ packageId: 'com.apkstore.client', certificateSha256: 'b'.repeat(64), versionCode: 14 }, { packageId: 'com.apkstore.client', signerSha256: signer, currentVersionCode: 13 }) ?? '', /sign/i);
  assert.match(validateStoreRelease({ packageId: 'com.apkstore.client', certificateSha256: signer, versionCode: 13 }, { packageId: 'com.apkstore.client', signerSha256: signer, currentVersionCode: 13 }) ?? '', /version/i);
});
