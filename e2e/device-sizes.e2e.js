import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';
import { SCREENS } from './screenList.js';
import { findLayoutProblems } from './deviceCheck.js';

// Every screen, in both themes, at a spread of real device sizes — the narrowest
// foldable cover screen up to a big desktop, phones sideways, iPads both ways.
// Fails on sideways scrolling, text running off-screen, text cut off with no
// ellipsis, text drawn on top of other text, and clipped bottom-bar labels.
// The sizes are set by the test itself, so it only needs to run once (in the
// phone project) rather than in all four.
const SIZES = [
  ['foldable cover', 280, 653],
  ['iPhone SE (1st gen)', 320, 568],
  ['small Android', 360, 640],
  ['iPhone SE', 375, 667],
  ['iPhone 14', 390, 844],
  ['iPhone Pro Max', 430, 932],
  ['phone sideways', 667, 375],
  ['iPad mini', 744, 1133],
  ['iPad Pro 12.9', 1024, 1366],
  ['iPad Air sideways', 1180, 820],
  ['laptop', 1280, 720],
  ['big desktop', 1920, 1080],
];

for (const [name, width, height] of SIZES) {
  for (const theme of ['light', 'dark']) {
    test(`fits ${name} (${width}x${height}) · ${theme}`, async ({ page, context }, testInfo) => {
      test.skip(testInfo.project.name !== 'phone', 'sizes are set here; one project is enough');
      test.setTimeout(240000);
      const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
      await page.setViewportSize({ width, height });
      const problems = [];
      for (const screen of SCREENS) {
        await page.goto(screen.path);
        if (screen.wait) await page.getByText(screen.wait, { exact: false }).filter({ visible: true }).first().waitFor({ timeout: 15000 });
        await settle(page);
        for (const p of await page.evaluate(findLayoutProblems)) problems.push(`${screen.name}: ${p.check} — ${p.msg}`);
      }
      expect(problems, `layout problems at ${width}x${height}`).toEqual([]);
      expect(ctx.consoleErrors, 'console / page errors').toEqual([]);
    });
  }
}
