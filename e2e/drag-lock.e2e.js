import { test, expect } from '@playwright/test';
import { openApp, settle } from './harness.js';
import { SCREENS } from './screenList.js';
import { COACH_BACKEND } from './coachFixtures.js';

// Nothing on a screen may drag in a direction it isn't meant to scroll:
// sideways strips (tabs, chips) must not move up/down, and vertical panels
// (the page area, sheets) must not slide sideways. A strip with overflow-x:auto
// also gets overflow-y:auto from CSS, so a 1px-too-tall tab label made the
// whole tab row draggable up and down on a phone.
test('no element can be dragged on the wrong axis, on any screen', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'axis rules are CSS, one project is enough');
  test.setTimeout(240000);
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  const offenders = [];
  for (const s of [...SCREENS, { name: 'coach-client', path: '/coach', click: 'Tarun' }]) {
    await page.goto(s.path);
    await settle(page);
    if (s.click) { await page.getByText(s.click, { exact: true }).first().click(); await settle(page); }
    const found = await page.evaluate(() => {
      const out = [];
      const label = (e) => `${e.tagName.toLowerCase()}[${(e.getAttribute('style') || e.className || '').toString().slice(0, 50)}]`;
      for (const e of document.querySelectorAll('body *')) {
        const st = getComputedStyle(e);
        const scrollsX = /(auto|scroll)/.test(st.overflowX);
        const scrollsY = /(auto|scroll)/.test(st.overflowY);
        if (scrollsX && scrollsY && (e.scrollHeight > e.clientHeight || e.scrollWidth > e.clientWidth)) {
          // A box that really can scroll both ways is only acceptable if it is not overflowing the wrong way.
          if (e.scrollHeight > e.clientHeight && e.scrollWidth > e.clientWidth) out.push(`scrolls both ways: ${label(e)}`);
          else if (e.scrollWidth > e.clientWidth) out.push(`sideways strip can also drag up/down: ${label(e)}`);
          else out.push(`vertical panel can also drag sideways: ${label(e)}`);
        }
      }
      return out;
    });
    for (const f of found) offenders.push(`${s.name}: ${f}`);
  }
  expect(offenders).toEqual([]);
});

test('the coach client tab strip does not move up or down — or slide the page sideways — under a finger', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'touch gestures on the phone project');
  await openApp({ page, context }, testInfo, COACH_BACKEND);
  await page.goto('/coach');
  await settle(page);
  await page.getByText('Tarun', { exact: true }).first().click();
  const strip = page.getByRole('tablist', { name: 'Client sections' });
  await strip.waitFor();
  const cdp = await context.newCDPSession(page);
  const swipe = async (xDistance, yDistance) => {
    const box = await strip.boundingBox();
    await cdp.send('Input.synthesizeScrollGesture', {
      x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2),
      xDistance, yDistance, gestureSourceType: 'touch', speed: 800,
    });
    await page.waitForTimeout(250);
  };
  await swipe(0, -30);
  expect(await strip.evaluate((e) => e.scrollTop), 'vertical drag moved the tab labels').toBe(0);
  // The four tabs fit on a phone, so there is nothing to scroll sideways — a sideways drag
  // must leave both the strip and the page where they are.
  await swipe(-200, 0);
  expect(await strip.evaluate((e) => e.scrollLeft), 'the tabs fit, so a sideways drag has nothing to scroll').toBe(0);
  expect(await page.evaluate(() => document.querySelector('.app-content-pad').scrollLeft), 'the page itself slid sideways').toBe(0);
});
