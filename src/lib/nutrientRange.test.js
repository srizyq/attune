import { describe, it, expect } from 'vitest';
import { rangeDates, loggedDayCount, dailyTotals, averages, macroAverages, groupedContributors } from './nutrientRange.js';

const dates = rangeDates('2026-09-23', 7);
const it_ = (loggedDate, name, over) => ({ id: `${loggedDate}${name}`, loggedDate, name, cal: 100, protein: 10, carbs: 10, fat: 2, calcium: 0, vitaminC: 0, ...over });
const items = [
  it_('2026-09-21', 'Yoghurt', { calcium: 300 }),
  it_('2026-09-22', 'Yoghurt', { calcium: 300 }),
  it_('2026-09-22', 'Cheese', { calcium: 100, cal: 300 }),
  it_('2026-09-23', 'Mystery bar', {}),
];

describe('rangeDates', () => {
  it('lists the days ending on the given one, oldest first, across a month end', () => {
    expect(dates[0]).toBe('2026-09-17');
    expect(dates[6]).toBe('2026-09-23');
    expect(rangeDates('2026-10-02', 4)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
});

describe('averages', () => {
  it('divides by the days with something logged, not the whole period', () => {
    expect(loggedDayCount(items)).toBe(3);
    const t = dailyTotals('calcium', items, new Map(), dates);
    expect(t.loggedDays).toBe(3);
    expect(t.average).toBeCloseTo((300 + 400 + 0) / 3);
    expect(t.days.find((d) => d.date === '2026-09-22').total).toBe(400);
    expect(t.days.find((d) => d.date === '2026-09-20').logged).toBe(false);
  });
  it('counts estimates for foods without a figure', () => {
    const est = new Map([['2026-09-23Mystery bar', { micros: { calcium: 60 }, via: 'usda' }]]);
    expect(averages(['calcium'], items, est, dates).calcium).toBeCloseTo((300 + 400 + 60) / 3);
  });
  it('averages calories and macros per logged day', () => {
    const m = macroAverages(items, dates);
    expect(m.cal).toBeCloseTo(600 / 3);
    expect(m).toMatchObject({ loggedDays: 3, periodDays: 7 });
  });
  it('is zero for a period with nothing logged', () => {
    expect(averages(['calcium'], [], new Map(), dates).calcium).toBe(0);
  });
});

describe('groupedContributors', () => {
  it('combines the same food across days with how often and its per-day average', () => {
    const g = groupedContributors('calcium', items, new Map(), 3);
    expect(g.rows.map((r) => [r.name, r.times, Math.round(r.amount)])).toEqual([['Yoghurt', 2, 600], ['Cheese', 1, 100]]);
    expect(g.rows[0].perDay).toBeCloseTo(200);
    expect(g.rows[0].share).toBeCloseTo(85.7, 0);
    expect(g.perDay).toBeCloseTo(700 / 3);
  });
});
