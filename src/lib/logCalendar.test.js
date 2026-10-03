import { describe, it, expect } from 'vitest';
import { dayFillPct, dayIsOver } from './logCalendar.js';

describe('dayIsOver', () => {
  it('is true once calories exceed the target', () => {
    expect(dayIsOver({ calories: 2200 }, 2000)).toBe(true);
  });
  it('is false right at or under the target', () => {
    expect(dayIsOver({ calories: 2000 }, 2000)).toBe(false);
    expect(dayIsOver({ calories: 1800 }, 2000)).toBe(false);
  });
  it('is false with no target set — nothing to be over', () => {
    expect(dayIsOver({ calories: 5000 }, null)).toBe(false);
    expect(dayIsOver({ calories: 5000 }, 0)).toBe(false);
  });
  it('is false for an empty/unlogged day', () => {
    expect(dayIsOver(null, 2000)).toBe(false);
    expect(dayIsOver({ calories: 0 }, 2000)).toBe(false);
  });
});

describe('dayFillPct stays capped at 100 even when over (dayIsOver is what signals red, not the height)', () => {
  it('caps at 100% well past the target', () => {
    expect(dayFillPct({ calories: 4000 }, 2000)).toBe(100);
  });
});
