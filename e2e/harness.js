import { expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { installFakeBackend } from './fakeBackend.js';
import { probe, scrollToBottom } from './layoutProbe.js';

// Things we've decided are fine and shouldn't fail a run. Keep this tiny and
// always say why.
const IGNORE_CONSOLE = [
  /Failed to load resource.*(fonts\.googleapis|fonts\.gstatic|jsdelivr)/i, // offline CI: web fonts / icon font
  /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|BLOCKED)/i,
];

// Headless Chrome reports 0 for env(safe-area-inset-*). Phones with a notch +
// home indicator (every recent iPhone) don't, so simulate one — the app shell
// reads its insets from these two variables.
async function simulateNotch(context) {
  await context.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = ':root{--safe-top:47px !important;--safe-bottom:34px !important}';
      document.head.appendChild(s);
    });
  });
}

/** Sets up the fake backend + console/pageerror capture for one test. */
export async function openApp({ page, context }, testInfo, backendOptions = {}) {
  const { unmocked } = await installFakeBackend(context, backendOptions);
  if (testInfo.project.use.isMobile) await simulateNotch(context);
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!IGNORE_CONSOLE.some((re) => re.test(t))) consoleErrors.push(`console: ${t}`);
  });
  return { unmocked, consoleErrors };
}

export async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(600); // entrance animations
}

/**
 * Probes the current screen at the top and scrolled to the bottom, screenshots
 * both, and fails the test with a readable list if anything is off.
 */
export async function assertLayout(page, testInfo, name, { unmocked = [], consoleErrors = [], scroll = true, allowDocumentScroll = false } = {}) {
  const dir = `e2e/screens/${testInfo.project.name}`;
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}-top.png` });
  const top = await page.evaluate(probe, { allowDocumentScroll });
  let bottom = { issues: [], notes: [] };
  if (scroll && (await page.evaluate(scrollToBottom))) {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${dir}/${name}-bottom.png` });
    bottom = await page.evaluate(probe, { scrolledToEnd: true, allowDocumentScroll });
  }
  const seen = new Set();
  const issues = [...top.issues, ...bottom.issues].filter((i) => { const k = `${i.kind}|${i.where}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const problems = [
    ...issues.map((i) => `${i.kind}: ${i.where} — ${i.detail}`),
    ...consoleErrors,
    ...unmocked.map((u) => `unmocked request: ${u}`),
  ];
  expect(problems, `\n${problems.join('\n')}\n`).toEqual([]);
}
