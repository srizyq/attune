import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Regression guards for "bottom sheet hidden behind the floating nav bar".
// On iOS a scroll container with `-webkit-overflow-scrolling: touch`, or an
// ancestor with a transform/opacity animation that is still *filling*, becomes
// a stacking context — and every sheet inside it is then painted under the
// nav (z-index 100) no matter its own z-index. Chrome can't reproduce it, so
// the e2e suite can't catch it; these keep the cause out of the stylesheets.
const css = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('stylesheets do not create stacking contexts around sheets', () => {
  it('no scroll container uses -webkit-overflow-scrolling: touch', () => {
    for (const f of ['appshell.css', 'index.css']) {
      const withoutPanels = css(f).split('}').filter((rule) => !/\.(modal-panel|sheet-panel)\b/.test(rule)).join('}');
      expect(withoutPanels, `${f} (outside modal/sheet panels)`).not.toMatch(/-webkit-overflow-scrolling\s*:\s*touch/);
    }
  });
  it('entrance-only animations on page content do not keep filling', () => {
    const all = css('appshell.css') + css('index.css');
    for (const cls of ['stagger-item', 'pop-in', 'day-slide-from-right', 'day-slide-from-left']) {
      const rule = all.match(new RegExp(`\\.${cls}\\s*\\{[^}]*\\}`));
      expect(rule, `.${cls} rule`).not.toBeNull();
      expect(rule[0], `.${cls}`).not.toMatch(/\b(both|forwards)\b/);
    }
  });
});
