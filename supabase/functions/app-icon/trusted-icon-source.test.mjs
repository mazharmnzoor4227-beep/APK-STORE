import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedIconSource } from './trusted-icon-source.mjs';

test('allows published F-Droid icon URLs', () => {
  assert.equal(trustedIconSource('https://f-droid.org/repo/com.amaze.filemanager/en-US/icon_i3rTEKkXiH92mYX6P1GxarVBABrjy-ROmWeb5h0XEFQ%3D.png'), true);
  assert.equal(trustedIconSource('https://f-droid.org/assets/ic_repo_app_default_KNN008Z2K7VNPZOFLMTry3JkfFYPxVGDopS1iwWe5wo%3D.png'), true);
});

test('allows raw GitHub image assets used by upstream projects', () => {
  assert.equal(trustedIconSource('https://raw.githubusercontent.com/Mobile-Artificial-Intelligence/maid/v3.0.0/fastlane/metadata/android/en-US/images/icon.png'), true);
});

test('rejects arbitrary hosts and non-image paths', () => {
  assert.equal(trustedIconSource('https://example.com/icon.png'), false);
  assert.equal(trustedIconSource('https://raw.githubusercontent.com/acme/app/main/README.md'), false);
});
