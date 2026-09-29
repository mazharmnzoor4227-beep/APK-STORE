import { test, expect } from '@playwright/test';

test('owner login uses email and password rather than magic-link OTP', async ({ page }) => {
  await page.goto('/admin/login');
  await expect(page.getByLabel('Owner email')).toBeVisible();
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByText('Send sign-in link')).toHaveCount(0);
});

test('owner hub exposes the required management destinations', async ({ page }) => {
  await page.goto('/admin/apps/new');
  await expect(page.getByRole('link', { name: 'Crash reports' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Trash' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Queue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('owner management destinations are real pages', async ({ page }) => {
  for (const [path, heading] of [['/admin/trash', 'Trash'], ['/admin/queue', 'Queue'], ['/admin/settings', 'Settings']] as const) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('owner management pages expose real controls', async ({ page }) => {
  await page.goto('/admin/trash');
  await expect(page.getByRole('button', { name: 'Refresh trash' })).toBeVisible();
  await page.goto('/admin/queue');
  await expect(page.getByLabel('Queue status')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh queue' })).toBeVisible();
  await page.goto('/admin/settings');
  await expect(page.getByLabel('New password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change password' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Validate live catalog' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
});

test('APK upload advertises 300 MB, drag-drop and cancel support', async ({ page }) => {
  await page.goto('/admin/apps/new');
  await expect(page.getByText(/Drop an APK here/i)).toBeVisible();
  await expect(page.getByText(/300 MB/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel upload' })).toBeVisible();
});

test('admin pages send baseline browser security headers', async ({ page }) => {
  const response = await page.goto('/admin/login');
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
});
