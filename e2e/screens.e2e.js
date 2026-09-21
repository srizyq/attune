import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { installFakeBackend } from './fakeBackend.js';
import { probe, scrollToBottom } from './layoutProbe.js';

// Every screen a signed-in user can reach. `wait` is text that proves the
// screen actually rendered its data (so we never "pass" on a blank page).
const SCREENS = [
  { name: 'dashboard', path: '/dashboard', wait: 'TODAY' },
  { name: 'daily-log', path: '/log', wait: 'Daily log' },
  { name: 'food-search', path: '/food' },
  { name: 'recipes', path: '/recipes' },
  { name: 'nutrients', path: '/nutrients' },
  { name: 'expenditure', path: '/expenditure' },
  { name: 'insights', path: '/insights' },
  { name: 'settings', path: '/settings' },
  { name: 'settings-goals', path: '/settings/goals' },
  { name: 'coach', path: '/coach' },
  { name: 'profile', path: '/profile' },
];

// Things we've decided are fine and shouldn't fail the run. Keep this tiny and
// always say why.
const IGNORE_CONSOLE = [
  /Failed to load resource.*(fonts\.googleapis|fonts\.gstatic|jsdelivr)/i, // offline CI: web fonts / icon font
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|BLOCKED)/i,
];

for (const screen of SCREENS) {
  test(`${screen.name}`, async ({ page, context }, testInfo) => {
    const { unmocked } = await installFakeBackend(context);
    // Headless Chrome reports 0 for env(safe-area-inset-*). Phones (the ones
    // with a notch + home indicator, i.e. every recent iPhone) don't, so
    // simulate one — the app shell reads its insets from these two variables.
    if (testInfo.project.use.isMobile) {
      await context.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
          const s = document.createElement('style');
          s.textContent = ':root{--safe-top:47px !important;--safe-bottom:34px !important}';
          document.head.appendChild(s);
        });
      });
    }
    const consoleErrors = [];
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (!IGNORE_CONSOLE.some((re) => re.test(t))) consoleErrors.push(`console: ${t}`);
    });

    await page.goto(screen.path);
    if (screen.wait) await page.getByText(screen.wait, { exact: false }).first().waitFor({ timeout: 15000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(600); // let entrance animations settle

    expect(new URL(page.url()).pathname, 'should not have been redirected away').toBe(screen.path);

    const dir = `e2e/screens/${testInfo.project.name}`;
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: `${dir}/${screen.name}-top.png` });

    const top = await page.evaluate(probe, {});
    const scrolled = await page.evaluate(scrollToBottom);
    let bottom = { issues: [], notes: [] };
    if (scrolled) {
      await page.waitForTimeout(250);
      await page.screenshot({ path: `${dir}/${screen.name}-bottom.png` });
      bottom = await page.evaluate(probe, { scrolledToEnd: true });
    }

    const seen = new Set();
    const issues = [...top.issues, ...bottom.issues].filter((i) => { const k = `${i.kind}|${i.where}`; if (seen.has(k)) return false; seen.add(k); return true; });
    if (top.notes.length) testInfo.annotations.push({ type: 'small-targets', description: `${top.notes.length}` });

    const problems = [
      ...issues.map((i) => `${i.kind}: ${i.where} — ${i.detail}`),
      ...consoleErrors,
      ...unmocked.map((u) => `unmocked request: ${u}`),
    ];
    expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
  });
}
