import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedExternalApkUrl } from './trusted-external-apk-url.mjs';

test('allows only the configured GitHub repository release APK', () => {
  assert.equal(trustedExternalApkUrl(
    'https://github.com/rikkahub/rikkahub/releases/download/2.5.5/rikkahub-2.5.5-arm64-v8a.apk',
    { githubOwner: 'rikkahub', githubRepo: 'rikkahub', packageId: 'me.rerere.rikkahub' }
  ), true);
  assert.equal(trustedExternalApkUrl(
    'https://github.com/evil/rikkahub/releases/download/2.5.5/rikkahub.apk',
    { githubOwner: 'rikkahub', githubRepo: 'rikkahub', packageId: 'me.rerere.rikkahub' }
  ), false);
});

test('allows an F-Droid APK only when filename matches the package id', () => {
  assert.equal(trustedExternalApkUrl(
    'https://f-droid.org/repo/com.termux_1022.apk',
    { githubOwner: 'termux', githubRepo: 'termux-app', packageId: 'com.termux' }
  ), true);
  assert.equal(trustedExternalApkUrl(
    'https://f-droid.org/repo/com.other_1022.apk',
    { githubOwner: 'termux', githubRepo: 'termux-app', packageId: 'com.termux' }
  ), false);
});

test('rejects lookalike hosts, non-APK assets, and credentials', () => {
  const ctx = { githubOwner: 'rikkahub', githubRepo: 'rikkahub', packageId: 'me.rerere.rikkahub' };
  assert.equal(trustedExternalApkUrl('https://github.com.evil.test/rikkahub/rikkahub/releases/download/2.5.5/a.apk', ctx), false);
  assert.equal(trustedExternalApkUrl('https://github.com/rikkahub/rikkahub/releases/download/2.5.5/a.zip', ctx), false);
  assert.equal(trustedExternalApkUrl('https://user:pass@github.com/rikkahub/rikkahub/releases/download/2.5.5/a.apk', ctx), false);
});
