import { test, expect } from '@playwright/test';
import { openApp, settle, assertLayout } from './harness.js';

// Bottom sheets must (a) sit above the floating nav bar — their buttons are
// the topmost thing at their own centre — and (b) render with the app's
// theme colours, in light mode too (a sheet portalled into <body> instead of
// the theme wrapper came out dark for light-mode users).
const SHEETS = [
  { name: 'log-item', path: '/log', buttons: ['Save', 'Delete'], open: async (p) => { await p.getByRole('button', { name: 'Meals' }).last().click(); await p.getByText('Grilled chicken').first().click(); } },
  { name: 'recipe', path: '/recipes', buttons: ['Log', 'Edit', 'Delete'], open: async (p) => { await p.getByText('Big breakfast').first().click(); } },
];

for (const theme of ['dark', 'light']) {
  for (const sheet of SHEETS) {
    test(`${sheet.name} sheet clears the nav and is themed · ${theme}`, async ({ page, context }, testInfo) => {
      const ctx = await openApp({ page, context }, testInfo, { profile: { theme } });
      await page.goto(sheet.path);
      await settle(page);
      await sheet.open(page);
      const dialog = page.getByRole('dialog').first();
      await dialog.waitFor();
      await page.waitForTimeout(400);

      // Inside the themed wrapper, and painted with the card colour of the active theme.
      const themed = await dialog.evaluate((el) => {
        const wrapper = el.closest('[data-theme]');
        if (!wrapper) return { ok: false };
        const probe = document.createElement('div');
        probe.style.background = 'var(--bg-card)';
        wrapper.appendChild(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return { ok: true, theme: wrapper.getAttribute('data-theme'), bg: getComputedStyle(el).backgroundColor, expected };
      });
      expect(themed.ok, 'sheet is inside the [data-theme] wrapper').toBe(true);
      expect(themed.theme).toBe(theme);
      expect(themed.bg).toBe(themed.expected);

      // Every action button is reachable: it is what a tap at its centre hits.
      for (const name of sheet.buttons) {
        const btn = dialog.getByRole('button', { name, exact: true });
        await btn.scrollIntoViewIfNeeded();
        const hit = await btn.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { onTop: el.contains(top), covered: top?.closest?.('.app-bottom-nav') ? 'bottom nav' : null };
        });
        expect(hit.covered, `${name} is under the nav`).toBeNull();
        expect(hit.onTop, `${name} is the top element at its centre`).toBe(true);
      }
      await assertLayout(page, testInfo, `x-sheet-${sheet.name}-${theme}`, ctx);
    });
  }
}
