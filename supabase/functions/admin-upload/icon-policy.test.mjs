import test from 'node:test';
import assert from 'node:assert/strict';
import { iconExtractionProblem, isPublishableIconUrl } from './icon-policy.mjs';

test('rejects missing launcher icon extraction', () => {
  assert.match(iconExtractionProblem(null), /launcher icon/i);
});

test('rejects unsupported launcher icon media type', () => {
  assert.match(iconExtractionProblem({ size: 1200, type: 'image/svg+xml' }), /PNG, JPEG or WebP/i);
});

test('accepts a supported non-empty launcher icon blob', () => {
  assert.equal(iconExtractionProblem({ size: 1200, type: 'image/png' }), '');
});

test('publish requires a credential-free https icon URL', () => {
  assert.equal(isPublishableIconUrl('https://example.com/icon.webp'), true);
  assert.equal(isPublishableIconUrl('http://example.com/icon.webp'), false);
  assert.equal(isPublishableIconUrl('https://user:pass@example.com/icon.webp'), false);
  assert.equal(isPublishableIconUrl(''), false);
});
