import { describe, it, expect } from 'vitest';
import { weekDays, shiftWeek, latestDate } from './weekStrip.js';
import { shiftDate } from './gestures.js';

describe('weekDays', () => {
  it('runs Sunday to Saturday around any day in the week', () => {
    const week = ['2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'];
    expect(weekDays('2026-09-27')).toEqual(week);
    expect(weekDays('2026-09-30')).toEqual(week);
    expect(weekDays('2026-10-03')).toEqual(week);
  });
  it('crosses month and year ends', () => {
    expect(weekDays('2026-01-01')[0]).toBe('2025-12-28');
    expect(weekDays('2026-01-01')[6]).toBe('2026-01-03');
  });
});

describe('shiftWeek', () => {
  const today = '2026-10-05'; // a Monday
  it('goes back a week to the same weekday', () => {
    expect(shiftWeek('2026-10-05', -1, today)).toBe('2026-09-28');
    expect(shiftWeek('2026-09-28', -1, today)).toBe('2026-09-21');
  });
  it('goes forward a week to the same weekday, including into the future', () => {
    expect(shiftWeek('2026-09-21', 1, today)).toBe('2026-09-28');
    expect(shiftWeek('2026-10-05', 1, today)).toBe('2026-10-12');
    expect(shiftWeek('2026-10-12', 1, today)).toBe('2026-10-19');
  });
  it('stops at the far end of how far ahead a day can be opened', () => {
    const last = latestDate(today);
    expect(shiftWeek(last, 1, today)).toBeNull();
    expect(shiftWeek(shiftDate(last, -7), 1, today)).toBe(last);
  });
});

describe('latestDate', () => {
  it('is two years after today', () => {
    expect(latestDate('2026-10-05')).toBe('2028-10-04');
  });
});
