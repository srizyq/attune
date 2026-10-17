import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Sign-up flow: a way to log in from every step, no dead "skip" on the last
// step, a Back button that keeps your answers, and a clear route to login when
// the email is already registered.
const DRAFT = { goal: 'lose', age: 30, sex: 'female', weight: 70, height: 170, unit: 'metric', activity: 'moderate', targets: { calories: 1800, protein: { g: 120 }, carbs: { g: 180 }, fat: { g: 60 }, water: 8 } };
const seed = (context, draft = DRAFT) => context.addInitScript((d) => { try { if (!sessionStorage.getItem('attune_onboarding')) sessionStorage.setItem('attune_onboarding', JSON.stringify(d)); } catch { /* ignore */ } }, draft);

for (const step of [1, 2, 3, 4]) {
  test(`step ${step} offers a way to log in`, async ({ page, context }, testInfo) => {
    await seed(context);
    await openApp({ page, context }, testInfo, { signedIn: false });
    await page.goto(`/onboarding/step${step}`);
    await settle(page);
    const login = page.getByRole('button', { name: /Already have an account\? Log in/ });
    await expect(login).toBeVisible();
    await login.click();
    await expect(page).toHaveURL(/\/login$/);
  });
}

test('the sign-up step has no skip button, but a Back button that keeps your answers', async ({ page, context }, testInfo) => {
  await seed(context);
  const ctx = await openApp({ page, context }, testInfo, { signedIn: false });
  const profileWrites = [];
  page.on('request', (r) => { if (r.url().includes('/rest/v1/profiles') && ['POST', 'PATCH', 'PUT'].includes(r.method())) profileWrites.push(JSON.parse(r.postData() || '{}')); });
  await page.goto('/onboarding/step4');
  await settle(page);
  await expect(page.getByRole('button', { name: /skip for now/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Back to your details/ })).toBeVisible();
  await assertLayout(page, testInfo, 'x-onboarding-step4', { ...ctx, allowDocumentScroll: true });

  await page.getByRole('button', { name: /Back to your details/ }).click();
  await expect(page).toHaveURL(/\/onboarding\/step3$/);
  // Still there for the details page to show, and for the sign-up step to use again.
  expect(await page.evaluate(() => sessionStorage.getItem('attune_onboarding'))).toContain('"goal":"lose"');
  const writesBefore = profileWrites.length;
  await page.getByRole('button', { name: /Next|Continue|→/ }).last().click();
  await expect(page).toHaveURL(/\/onboarding\/step4$/);
  await settle(page);
  // Coming back re-applies the answers to the guest profile (edits made on the way take effect).
  expect(profileWrites.length).toBeGreaterThan(writesBefore);
});

test('the earlier steps still have their skip link', async ({ page, context }, testInfo) => {
  await seed(context);
  await openApp({ page, context }, testInfo, { signedIn: false });
  await page.goto('/onboarding/step2');
  await settle(page);
  await page.getByRole('button', { name: /skip for now/i }).click();
  await expect(page).toHaveURL(/\/onboarding\/step4$/);
});

test('an email that is already registered points to Log in', async ({ page, context }, testInfo) => {
  await seed(context);
  await openApp({ page, context }, testInfo, { signedIn: false });
  await page.route(/\/auth\/v1\/user(\?|$)/, (route) => (route.request().method() === 'PUT'
    ? route.fulfill({ status: 422, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: 'email_exists', msg: 'A user with this email address has already been registered' }) })
    : route.fallback()));
  await page.goto('/onboarding/step4');
  await settle(page);
  await page.getByRole('checkbox').check();
  await page.getByPlaceholder('Email address').fill('taken@example.test');
  await page.getByPlaceholder(/Password/).fill('password123');
  await page.getByRole('button', { name: /Create account/ }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('already registered');
  await alert.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
