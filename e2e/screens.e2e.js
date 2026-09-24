import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { SCREENS } from './screenList.js';

for (const screen of SCREENS) {
  test(screen.name, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo);
    await page.goto(screen.path);
    // filter({ visible: true }), not just .first() — the bottom nav's tab
    // labels are real DOM text even when display:none on desktop (AppNav.jsx
    // always renders both the sidebar and the pill), so a wait string that
    // happens to match a nav label too (e.g. "Daily log") would otherwise
    // have .first() lock onto the permanently-hidden nav copy and time out
    // waiting for it to appear. (.locator(':visible') chained on a text
    // locator searches its *descendants* for a visible one, not a self-
    // filter, so it doesn't work here — filter({ visible: true }) does.)
    if (screen.wait) await page.getByText(screen.wait, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
    await settle(page);
    expect(new URL(page.url()).pathname, 'should not have been redirected away').toBe(screen.path);
    await assertLayout(page, testInfo, screen.name, ctx);
  });
}
