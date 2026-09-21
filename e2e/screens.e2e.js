import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';
import { SCREENS } from './screenList.js';

for (const screen of SCREENS) {
  test(screen.name, async ({ page, context }, testInfo) => {
    const ctx = await openApp({ page, context }, testInfo);
    await page.goto(screen.path);
    if (screen.wait) await page.getByText(screen.wait, { exact: false }).first().waitFor({ timeout: 15000 });
    await settle(page);
    expect(new URL(page.url()).pathname, 'should not have been redirected away').toBe(screen.path);
    await assertLayout(page, testInfo, screen.name, ctx);
  });
}
