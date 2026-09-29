import test from 'node:test';
import assert from 'node:assert/strict';
import { bodySizeAllowed, normalizeCrashPayload, MAX_BODY_BYTES, MAX_MESSAGE_CHARS, MAX_STACK_CHARS } from './crash-payload.mjs';

const NOW = Date.parse('2026-09-29T07:30:00.000Z');
const valid = {
  fingerprint: 'a'.repeat(64),
  package_id: 'com.apkstore.client',
  version_code: 13,
  version_name: '1.1.5',
  android_sdk: 36,
  device_manufacturer: 'Infinix',
  device_model: 'X6885',
  exception_class: 'java.lang.RuntimeException',
  message: 'boom',
  stack_trace: 'java.lang.RuntimeException: boom\n at app.Main.run(Main.java:1)',
  occurred_at: '2026-09-29T07:29:00.000Z'
};

test('normalizes valid bounded APK STORE crash report', () => {
  const result = normalizeCrashPayload(valid, NOW);
  assert.equal(result.package_id, 'com.apkstore.client');
  assert.equal(result.version_code, 13);
  assert.equal(result.fingerprint, 'a'.repeat(64));
});

test('rejects wrong package, malformed fingerprint, unknown fields and bad timestamp', () => {
  assert.throws(() => normalizeCrashPayload({ ...valid, package_id: 'other.app' }, NOW), /package/);
  assert.throws(() => normalizeCrashPayload({ ...valid, fingerprint: 'bad' }, NOW), /fingerprint/);
  assert.throws(() => normalizeCrashPayload({ ...valid, surprise: true }, NOW), /Unknown/);
  assert.throws(() => normalizeCrashPayload({ ...valid, occurred_at: '2030-01-01T00:00:00Z' }, NOW), /timestamp/);
});

test('truncates technical strings and redacts common sensitive values', () => {
  const result = normalizeCrashPayload({
    ...valid,
    message: '\u0000user@example.com token=supersecret ' + 'x'.repeat(4000),
    stack_trace: 'https://example.com/private?apikey=hello\n' + 'y'.repeat(40000),
    device_model: 'z'.repeat(200)
  }, NOW);
  assert.equal(result.message.length, MAX_MESSAGE_CHARS);
  assert.equal(result.stack_trace.length, MAX_STACK_CHARS);
  assert.equal(result.device_model.length, 120);
  assert.equal(result.message.includes('\u0000'), false);
  assert.equal(result.message.includes('user@example.com'), false);
  assert.equal(result.message.includes('supersecret'), false);
  assert.equal(result.stack_trace.includes('https://example.com'), false);
});

test('body size hard cap counts UTF-8 bytes at 48 KiB', () => {
  assert.equal(MAX_BODY_BYTES, 48 * 1024);
  assert.equal(bodySizeAllowed(JSON.stringify(valid)), true);
  assert.equal(bodySizeAllowed('x'.repeat(MAX_BODY_BYTES)), true);
  assert.equal(bodySizeAllowed('x'.repeat(MAX_BODY_BYTES + 1)), false);
  assert.equal(bodySizeAllowed('🙂'.repeat(13000)), false);
});
