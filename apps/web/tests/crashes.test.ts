import test from 'node:test';
import assert from 'node:assert/strict';
import { decorateCrashIssues, isCrashFingerprint, isCrashStatus } from '../lib/admin/crashes.ts';

test('validates only supported crash states and sha256 fingerprints', () => {
  assert.equal(isCrashStatus('open'), true);
  assert.equal(isCrashStatus('resolved'), true);
  assert.equal(isCrashStatus('ignored'), true);
  assert.equal(isCrashStatus('deleted'), false);
  assert.equal(isCrashFingerprint('a'.repeat(64)), true);
  assert.equal(isCrashFingerprint('A'.repeat(64)), false);
  assert.equal(isCrashFingerprint('bad'), false);
});

test('decorates crash groups with bounded unique diagnostic facets and latest event', () => {
  const issue = {
    fingerprint: 'a'.repeat(64), package_id: 'com.apkstore.client', title: 'RuntimeException',
    exception_class: 'java.lang.RuntimeException', status: 'open' as const,
    first_seen_at: '2026-09-29T01:00:00Z', last_seen_at: '2026-09-29T02:00:00Z',
    event_count: 2, latest_version_code: 14, latest_version_name: '1.1.6'
  };
  const events = [
    { fingerprint: issue.fingerprint, version_code: 14, version_name: '1.1.6', android_sdk: 36, device_manufacturer: 'Infinix', device_model: 'X6885', exception_class: issue.exception_class, message: 'latest', stack_trace: 'trace latest', occurred_at: '2026-09-29T02:00:00Z', received_at: '2026-09-29T02:01:00Z' },
    { fingerprint: issue.fingerprint, version_code: 13, version_name: '1.1.5', android_sdk: 35, device_manufacturer: 'Google', device_model: 'Pixel', exception_class: issue.exception_class, message: 'older', stack_trace: 'trace old', occurred_at: '2026-09-29T01:00:00Z', received_at: '2026-09-29T01:01:00Z' }
  ];
  const [result] = decorateCrashIssues([issue], events);
  assert.deepEqual(result.versions, ['1.1.6 (14)', '1.1.5 (13)']);
  assert.deepEqual(result.androidVersions, ['Android SDK 36', 'Android SDK 35']);
  assert.deepEqual(result.deviceModels, ['Infinix X6885', 'Google Pixel']);
  assert.equal(result.latestEvent?.message, 'latest');
});
