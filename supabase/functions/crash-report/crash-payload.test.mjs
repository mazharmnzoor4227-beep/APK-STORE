import test from 'node:test';
import assert from 'node:assert/strict';
import { bodySizeAllowed, normalizeCrashPayload, MAX_BODY_BYTES } from './crash-payload.mjs';

const NOW = Date.parse('2026-09-30T00:00:00Z');
const valid = {
  fingerprint: 'a'.repeat(64),
  package_id: 'com.apkstore.client',
  version_code: 15,
  version_name: '1.1.7',
  android_sdk: 36,
  device_manufacturer: 'INFINIX',
  device_model: 'X6885',
  exception_class: 'java.lang.IllegalStateException',
  message: 'token=abc user@example.com https://example.com/private',
  stack_trace: 'java.lang.IllegalStateException\n\tat com.apkstore.client.MainActivity.onCreate(MainActivity.java:150)',
  occurred_at: '2026-09-29T23:59:00Z'
};

test('normalizes and redacts a valid APK STORE crash', () => {
  const event = normalizeCrashPayload(valid, NOW);
  assert.equal(event.package_id, 'com.apkstore.client');
  assert.equal(event.version_code, 15);
  assert.equal(event.android_sdk, 36);
  assert.equal(event.fingerprint, 'a'.repeat(64));
  assert.equal(event.message, 'token=[redacted] [email] [url]');
});

test('rejects unknown fields so accidental personal data is not accepted', () => {
  assert.throws(() => normalizeCrashPayload({ ...valid, screen: 'detail' }, NOW), /Unknown crash field/);
});

test('rejects wrong package and invalid timestamp', () => {
  assert.throws(() => normalizeCrashPayload({ ...valid, package_id: 'other.app' }, NOW), /Invalid package/);
  assert.throws(() => normalizeCrashPayload({ ...valid, occurred_at: '2025-01-01T00:00:00Z' }, NOW), /Invalid crash timestamp/);
});

test('enforces byte-size limit', () => {
  assert.equal(bodySizeAllowed('x'.repeat(MAX_BODY_BYTES)), true);
  assert.equal(bodySizeAllowed('x'.repeat(MAX_BODY_BYTES + 1)), false);
});
