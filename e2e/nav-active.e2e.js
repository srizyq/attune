import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';
import { SCREENS } from './screenList.js';

// Regression guard: DailyLog/SettingsGoals/Expenditure/Nutrients each once
// passed no `active` prop to <AppNav> at all, silently leaving every bottom-
// nav tab unhighlighted (and dot-less, once the active-tab dot existed) on
// those pages — found by eye, not by any check, while working on the nav's
// visual redesign. Checks the floating pill nav (phone/tablet) specifically;
// the desktop sidebar has a deliberately smaller item set (no "Daily log"
// tab at all, for one), so it needs its own comparison, not this one.
//
// Mobile trims to 5 slots (dashboard/log/+/coach/settings — see AppNav.jsx's
// own comment), so food-search/recipes and insights are intentionally
// tab-less there; every other screen should highlight exactly one.
const NO_MOBILE_TAB = new Set(['food-search', 'recipes', 'insights']);

for (const screen of SCREENS) {
  test(`nav highlights ${screen.name}`, async ({ page, context }, testInfo) => {
    test.skip(!testInfo.project.use.isMobile && testInfo.project.name !== 'tablet', 'desktop sidebar has a different, smaller item set');
    await openApp({ page, context }, testInfo);
    await page.goto(screen.path);
    await settle(page);
    const activeCount = await page.locator('.app-bottom-icon.is-active').count();
    const expected = NO_MOBILE_TAB.has(screen.name) ? 0 : 1;
    expect(activeCount, `${screen.name}: expected ${expected} active bottom-nav tab(s)`).toBe(expected);
  });
}
