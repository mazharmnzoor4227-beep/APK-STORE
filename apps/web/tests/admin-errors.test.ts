import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAdminError } from '../lib/admin/errors.ts';

test('backend errors are bounded and redact URLs and bearer tokens', () => {
  const value = sanitizeAdminError(new Error('failed https://secret.example/path Authorization: Bearer abc.def.ghi ' + 'x'.repeat(3000)));
  assert.ok(value.length <= 1000);
  assert.equal(value.includes('secret.example'), false);
  assert.equal(value.includes('abc.def.ghi'), false);
});
