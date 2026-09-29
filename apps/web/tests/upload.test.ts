import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCandidateUpload, recordInspection, verifyInspectionSignature } from '../lib/apk/inspection.ts';

const valid = { packageId: 'dev.apkstore.test', versionCode: 2, versionName: '2.0', certificateSha256: 'a'.repeat(64), apkSha256: 'b'.repeat(64), byteSize: 1024 };

test('only verified owner can issue a private upload target', async () => {
  let called = false;
  await assert.rejects(createCandidateUpload({ ownerId: null, filename: 'test.apk', byteSize: 1024 }, { create: async () => { called = true; return { id: '1', signedUrl: 'url' }; } }), /Owner authorization required/);
  assert.equal(called, false);
});

test('invalid extensions and files over the 300 MB contract fail before upload', async () => {
  let calls = 0;
  const provider = { create: async () => { calls += 1; return { id: '1', signedUrl: 'url' }; } };
  await assert.rejects(createCandidateUpload({ ownerId: 'owner', filename: 'not-apk.zip', byteSize: 1024 }, provider), /APK file required/);
  await createCandidateUpload({ ownerId: 'owner', filename: 'large.apk', byteSize: 250 * 1024 * 1024 }, provider);
  assert.equal(calls, 1);
  await assert.rejects(createCandidateUpload({ ownerId: 'owner', filename: 'too-large.apk', byteSize: 300 * 1024 * 1024 + 1 }, provider), /300 MB/);
});

test('an expired or interrupted candidate cannot be inspected as a valid release', async () => {
  const repository = { get: async () => ({ id: 'candidate', expiresAt: Date.now() - 1, byteSize: 1024, status: 'uploading' }), record: async () => { throw new Error('must not record'); } };
  await assert.rejects(recordInspection('candidate', valid, repository), /expired/);
});

test('inspection rejects malformed metadata and mismatched uploaded size', async () => {
  const repository = { get: async () => ({ id: 'candidate', expiresAt: Date.now() + 1000, byteSize: 1024, status: 'uploaded' }), record: async () => { throw new Error('must not record'); } };
  await assert.rejects(recordInspection('candidate', { ...valid, packageId: 'fake' }, repository), /package ID/);
  await assert.rejects(recordInspection('candidate', { ...valid, byteSize: 999 }, repository), /size mismatch/);
});

test('inspection callback refuses missing or wrong HMAC', () => {
  assert.equal(verifyInspectionSignature('{"candidate":"1"}', '', 'shared-secret'), false);
  assert.equal(verifyInspectionSignature('{"candidate":"1"}', 'sha256=invalid', 'shared-secret'), false);
});
