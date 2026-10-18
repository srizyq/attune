// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// In Slots mode a logged food must land in a slot, not in Uncategorised. That
// was broken for scans and recipes because each place that logs food had to
// remember to pass the slot. This fails when a new place that logs food doesn't
// mention slots at all, so the next one can't forget quietly.
const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const files = walk('src').filter((f) => /\.jsx?$/.test(f) && !/\.test\./.test(f));
const LOGS_FOOD = /\b(addFood|addFoodLog)\(/;
const HANDLES_SLOTS = /\b(slotFor|slotFromTime|slotId|presetSlotId)\b/;

// Places that log food on purpose without a slot, and why.
const ALLOWED = {
  'src/components/MealPlanCard.jsx': "logs a coach's planned meal under its own meal (breakfast, lunch...), which is not a Slots-mode surface",
};

describe('every place that logs food accounts for Slots mode', () => {
  const callers = files.filter((f) => LOGS_FOOD.test(readFileSync(f, 'utf8')) && !/hooks\/useFoodLogs\.js$|lib\/db\.js$/.test(f.replace(/\\/g, '/')));

  it('finds the places that log food (so this test cannot pass by looking at nothing)', () => {
    const names = callers.map((f) => f.replace(/\\/g, '/'));
    for (const expected of ['src/pages/FoodSearch.jsx', 'src/pages/Scan.jsx', 'src/pages/Recipes.jsx', 'src/pages/DailyLog.jsx']) expect(names).toContain(expected);
  });

  for (const file of callers) {
    const name = file.replace(/\\/g, '/');
    it(`${name} passes a slot, or is allowed not to`, () => {
      const source = readFileSync(file, 'utf8');
      if (ALLOWED[name]) return;
      expect(source, `${name} logs food but never mentions a slot — pass slotFor(daySlots, ...) like Scan.jsx does, or add it to ALLOWED with a reason`).toMatch(HANDLES_SLOTS);
    });
  }

  it('the allowed list only names files that still log food', () => {
    for (const name of Object.keys(ALLOWED)) expect(callers.map((f) => f.replace(/\\/g, '/'))).toContain(name);
  });
});
