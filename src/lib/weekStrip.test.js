import { describe, it, expect } from 'vitest';
import { weekDays, shiftWeek } from './weekStrip.js';

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
  it('goes forward a week when that day has happened', () => {
    expect(shiftWeek('2026-09-21', 1, today)).toBe('2026-09-28');
  });
  it('lands on today when the same weekday next week is still in the future', () => {
    expect(shiftWeek('2026-09-30', 1, today)).toBe(today);
  });
  it('does nothing when the next week has not started', () => {
    expect(shiftWeek('2026-10-05', 1, today)).toBeNull();
  });
});
