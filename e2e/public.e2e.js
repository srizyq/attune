import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Signed-out pages: landing, login, legal, onboarding. They have their own
// theme toggle (usePreAuthTheme), so check both themes.
const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'terms', path: '/terms' },
  { name: 'privacy', path: '/privacy' },
  { name: 'onboarding-welcome', path: '/onboarding/welcome' },
  { name: 'onboarding-step1', path: '/onboarding/step1' },
];

for (const scheme of ['dark', 'light']) {
  for (const p of PAGES) {
    test(`${p.name} (${scheme})`, async ({ page, context }, testInfo) => {
      await context.addInitScript((mode) => { try { localStorage.setItem('attune_preauth_theme', mode); } catch { /* ignore */ } }, scheme);
      const ctx = await openApp({ page, context }, testInfo, { signedIn: false });
      await page.goto(p.path);
      await settle(page);
      expect(new URL(page.url()).pathname, 'should not have been redirected away').toBe(p.path);
      // Onboarding and legal pages are ordinary scrolling documents, unlike the app's fixed-height screens.
      await assertLayout(page, testInfo, `public-${p.name}-${scheme}`, { ...ctx, allowDocumentScroll: true });
    });
  }
}
