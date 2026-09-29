import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReviewFields } from '../lib/admin/review-fields.ts';

test('review fields preserve supported catalog metadata safely', () => {
  const value = normalizeReviewFields({
    slug: 'sample-app', title: 'Sample', category: 'Tools', description: 'Long description',
    shortDescription: 'Short description', releaseNotes: 'Changed things', license: 'MIT',
    sourceUrl: 'https://github.com/example/sample', fdroidUrl: 'https://f-droid.org/packages/com.example.sample/',
    priceType: 'Free', recommended: true,
  });
  assert.equal(value.slug, 'sample-app');
  assert.equal(value.shortDescription, 'Short description');
  assert.equal(value.priceType, 'Free');
  assert.equal(value.recommended, true);
});

test('review fields reject unsafe URLs and unsupported price types', () => {
  assert.throws(() => normalizeReviewFields({ slug: 'a', title: 'A', category: 'Tools', sourceUrl: 'javascript:alert(1)' }));
  assert.throws(() => normalizeReviewFields({ slug: 'a', title: 'A', category: 'Tools', priceType: 'Crypto only' }));
});

test('review fields enforce bounded text', () => {
  assert.throws(() => normalizeReviewFields({ slug: 'a', title: 'x'.repeat(121), category: 'Tools' }));
  assert.throws(() => normalizeReviewFields({ slug: 'a', title: 'A', category: 'Tools', shortDescription: 'x'.repeat(81) }));
});
