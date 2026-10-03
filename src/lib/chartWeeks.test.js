import { describe, it, expect } from 'vitest';
import { weekStartOf, bucketWeeks } from './chartWeeks';

const day = (date, calories, extra = {}) => ({ date, calories, ...extra });

describe('weekStartOf', () => {
  it('returns the Sunday on or before the date', () => {
    expect(weekStartOf('2026-10-03')).toBe('2026-09-27'); // Saturday
    expect(weekStartOf('2026-09-27')).toBe('2026-09-27'); // Sunday itself
    expect(weekStartOf('2026-09-28')).toBe('2026-09-27'); // Monday
  });
  it('crosses month and year boundaries', () => {
    expect(weekStartOf('2026-01-01')).toBe('2025-12-28');
  });
});

describe('bucketWeeks', () => {
  it('groups days into Sunday-start weeks, in order', () => {
    const days = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-10-03', '2026-10-04'].map((d) => day(d, 1000));
    expect(bucketWeeks(days).map((w) => [w.date, w.dayCount])).toEqual([
      ['2026-09-20', 1], ['2026-09-27', 3], ['2026-10-04', 1],
    ]);
  });
  it('averages only the days that have food logged', () => {
    const w = bucketWeeks([day('2026-09-27', 2000), day('2026-09-28', 0), day('2026-09-29', 1000)])[0];
    expect(w.calories).toBe(1500);
    expect(w.loggedDays).toBe(2);
  });
  it('a week with nothing logged is 0, not NaN', () => {
    const w = bucketWeeks([day('2026-09-27', 0), day('2026-09-28', 0)])[0];
    expect(w.calories).toBe(0);
    expect(w.loggedDays).toBe(0);
  });
  it('averages the per-day targets and burned calories across all days of the week', () => {
    const w = bucketWeeks([
      day('2026-09-27', 100, { baseTarget: 2000, caloriesBurned: 300 }),
      day('2026-09-28', 100, { baseTarget: 1800, caloriesBurned: 0 }),
    ])[0];
    expect(w.baseTarget).toBe(1900);
    expect(w.caloriesBurned).toBe(150);
  });
  it('leaves baseTarget undefined when no day has one, so callers fall back to the shared target', () => {
    expect(bucketWeeks([day('2026-09-27', 100)])[0].baseTarget).toBeUndefined();
  });
  it('records the last date it covers', () => {
    expect(bucketWeeks([day('2026-09-27', 1), day('2026-09-29', 1)])[0].endDate).toBe('2026-09-29');
  });
  it('is empty for no days', () => {
    expect(bucketWeeks([])).toEqual([]);
  });
});
