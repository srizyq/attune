import { describe, it, expect } from 'vitest';
import {
  limitPeriods, activeLimit, limitedTargets, daysLeft, endDateForDays, startLimit, endLimitEarly,
  currentOrUpcoming, pastLimits, periodLengthDays, LIMIT_MIN_CALORIES, LIMIT_MAX_DAYS, MAX_STORED_PERIODS,
} from './calorieLimit';

const P = (over = {}) => ({ id: 'a', start: '2026-10-01', end: '2026-10-14', calories: 1800, created_at: '2026-10-01T00:00:00Z', ...over });
const pro = (periods) => ({ is_premium: true, calorie_limit_periods: periods });

describe('limitPeriods', () => {
  it('returns well-formed periods and drops garbage', () => {
    const profile = { calorie_limit_periods: [P(), { start: 'x' }, null, 'str', P({ id: 'b', start: '2026-11-05', end: '2026-11-01' }), P({ id: 'c', calories: 0 }), P({ id: 'd', calories: 'many' })] };
    expect(limitPeriods(profile).map((p) => p.id)).toEqual(['a']);
  });
  it('is empty when nothing is stored or the field is the wrong type', () => {
    expect(limitPeriods(null)).toEqual([]);
    expect(limitPeriods({})).toEqual([]);
    expect(limitPeriods({ calorie_limit_periods: 'oops' })).toEqual([]);
  });
});

describe('activeLimit', () => {
  const profile = pro([P()]);
  it('covers both ends of the period, inclusive', () => {
    expect(activeLimit(profile, '2026-10-01')?.id).toBe('a');
    expect(activeLimit(profile, '2026-10-14')?.id).toBe('a');
    expect(activeLimit(profile, '2026-09-30')).toBeNull();
    expect(activeLimit(profile, '2026-10-15')).toBeNull();
  });
  it('only applies to Pro (or Coach Pass) accounts — a lapsed Pro reverts', () => {
    expect(activeLimit({ calorie_limit_periods: [P()] }, '2026-10-05')).toBeNull();
    expect(activeLimit({ is_premium: false, calorie_limit_periods: [P()] }, '2026-10-05')).toBeNull();
    expect(activeLimit({ coach_pass: true, calorie_limit_periods: [P()] }, '2026-10-05')?.id).toBe('a');
  });
  it('is null for a bad date', () => {
    expect(activeLimit(profile, 'nope')).toBeNull();
    expect(activeLimit(profile, undefined)).toBeNull();
  });
});

describe('limitedTargets', () => {
  const base = { calories: 2200, protein_g: 165, carbs_g: 220, fat_g: 73, isRestDay: false };
  it('sets calories and scales the macros by the same ratio', () => {
    const out = limitedTargets(base, P({ calories: 1760 })); // 0.8
    expect(out).toMatchObject({ calories: 1760, protein_g: 132, carbs_g: 176, fat_g: 58 });
  });
  it('keeps unrelated fields', () => {
    expect(limitedTargets({ ...base, isRestDay: true }, P()).isRestDay).toBe(true);
  });
  it('can go up as well as down', () => {
    expect(limitedTargets(base, P({ calories: 2640 })).protein_g).toBe(198);
  });
  it('leaves unset macros unset', () => {
    const out = limitedTargets({ calories: 2000, protein_g: null, carbs_g: null, fat_g: null }, P({ calories: 1500 }));
    expect(out).toMatchObject({ calories: 1500, protein_g: null, carbs_g: null, fat_g: null });
  });
  it('with no calorie target to compare against, sets calories and leaves the macros', () => {
    const out = limitedTargets({ calories: null, protein_g: 150 }, P({ calories: 1500 }));
    expect(out).toMatchObject({ calories: 1500, protein_g: 150 });
  });
  it('does not mutate its input', () => {
    const copy = { ...base };
    limitedTargets(base, P());
    expect(base).toEqual(copy);
  });
});

describe('daysLeft / lengths', () => {
  it('counts today as a day', () => {
    expect(daysLeft(P(), '2026-10-14')).toBe(1);
    expect(daysLeft(P(), '2026-10-13')).toBe(2);
    expect(daysLeft(P(), '2026-10-01')).toBe(14);
  });
  it('is 0 once over and the full length before it starts', () => {
    expect(daysLeft(P(), '2026-10-15')).toBe(0);
    expect(daysLeft(P(), '2026-09-20')).toBe(14);
  });
  it('endDateForDays: "14 days" from the 4th ends on the 17th', () => {
    expect(endDateForDays('2026-10-04', 14)).toBe('2026-10-17');
    expect(endDateForDays('2026-10-04', 1)).toBe('2026-10-04');
  });
  it('periodLengthDays', () => {
    expect(periodLengthDays(P())).toBe(14);
  });
});

describe('startLimit', () => {
  const args = { calories: 1800, endDate: '2026-10-17', today: '2026-10-04', id: 'new', nowIso: '2026-10-04T01:00:00Z' };
  it('adds a period starting today', () => {
    const out = startLimit([], args);
    expect(out.periods).toEqual([{ id: 'new', start: '2026-10-04', end: '2026-10-17', calories: 1800, created_at: '2026-10-04T01:00:00Z' }]);
  });
  it('rounds the calories to a whole number', () => {
    expect(startLimit([], { ...args, calories: '1799.6' }).periods[0].calories).toBe(1800);
  });
  it('refuses numbers that are too low, too high, or not numbers', () => {
    expect(startLimit([], { ...args, calories: LIMIT_MIN_CALORIES - 1 }).error).toMatch(/lowest/);
    expect(startLimit([], { ...args, calories: 50000 }).error).toMatch(/check the number/);
    expect(startLimit([], { ...args, calories: '' }).error).toMatch(/lowest/);
    expect(startLimit([], { ...args, calories: 'abc' }).error).toBeTruthy();
  });
  it('needs a real end date, today or later, and not absurdly far away', () => {
    expect(startLimit([], { ...args, endDate: '' }).error).toMatch(/end date/i);
    expect(startLimit([], { ...args, endDate: '2026-10-03' }).error).toMatch(/today or later/);
    expect(startLimit([], { ...args, endDate: '2026-10-04' }).periods).toHaveLength(1); // a one-day limit
    expect(startLimit([], { ...args, endDate: endDateForDays('2026-10-04', LIMIT_MAX_DAYS) }).periods).toHaveLength(1);
    expect(startLimit([], { ...args, endDate: endDateForDays('2026-10-04', LIMIT_MAX_DAYS + 1) }).error).toMatch(/up to 365/);
  });
  it('allows only one limit at a time, but not a finished one', () => {
    expect(startLimit([P({ start: '2026-10-01', end: '2026-10-10' })], args).error).toMatch(/already have a limit/);
    expect(startLimit([P({ start: '2026-09-01', end: '2026-09-30' })], args).periods).toHaveLength(2);
  });
  it('forgets history older than about a year, and caps how many it keeps', () => {
    const old = P({ id: 'old', start: '2025-01-01', end: '2025-01-10' });
    expect(startLimit([old], args).periods.map((p) => p.id)).toEqual(['new']);
    const many = Array.from({ length: 80 }, (_, i) => P({ id: `p${i}`, start: '2026-08-01', end: '2026-08-02' }));
    expect(startLimit(many, args).periods).toHaveLength(MAX_STORED_PERIODS);
  });
});

describe('endLimitEarly', () => {
  it('cuts a running limit to end yesterday, keeping the days already lived', () => {
    const out = endLimitEarly([P({ end: '2026-10-20' })], 'a', '2026-10-05');
    expect(out[0]).toMatchObject({ start: '2026-10-01', end: '2026-10-04' });
  });
  it('removes one that has not covered a day yet (started today)', () => {
    expect(endLimitEarly([P({ start: '2026-10-05', end: '2026-10-10' })], 'a', '2026-10-05')).toEqual([]);
  });
  it('leaves other periods alone', () => {
    const other = P({ id: 'z', start: '2026-08-01', end: '2026-08-05' });
    expect(endLimitEarly([other, P({ end: '2026-10-20' })], 'a', '2026-10-05')[0]).toBe(other);
  });
  it('after ending, the day it was ended is back to normal', () => {
    const profile = pro(endLimitEarly([P({ end: '2026-10-20' })], 'a', '2026-10-05'));
    expect(activeLimit(profile, '2026-10-04')?.id).toBe('a');
    expect(activeLimit(profile, '2026-10-05')).toBeNull();
  });
});

describe('currentOrUpcoming / pastLimits', () => {
  const profile = { calorie_limit_periods: [P({ id: 'p1', start: '2026-08-01', end: '2026-08-14' }), P({ id: 'p2', start: '2026-09-01', end: '2026-09-14' }), P({ id: 'cur', start: '2026-10-01', end: '2026-10-14' })] };
  it('finds the running one', () => {
    expect(currentOrUpcoming(profile, '2026-10-05')?.id).toBe('cur');
    expect(currentOrUpcoming(profile, '2026-10-20')).toBeNull();
  });
  it('lists finished ones newest first', () => {
    expect(pastLimits(profile, '2026-10-05').map((p) => p.id)).toEqual(['p2', 'p1']);
  });
});
