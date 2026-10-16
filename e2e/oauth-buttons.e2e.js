import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';

// "Continue with Google / Apple" only appears for providers that are switched on
// in Supabase — otherwise tapping one lands on a raw "provider is not enabled"
// error page.
test('no sign-in buttons for providers that are not enabled', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { signedIn: false, authProviders: [] });
  await page.goto('/login');
  await settle(page);
  await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Log in|Sign in/i }).first()).toBeVisible();
});

test('only the enabled providers get a button', async ({ page, context }, testInfo) => {
  await openApp({ page, context }, testInfo, { signedIn: false, authProviders: ['google'] });
  await page.goto('/login');
  await settle(page);
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Apple' })).toHaveCount(0);
});
