import { describe, it, expect } from 'vitest';
import { weeklySummary } from './weeklySummary';

const TODAY = '2026-10-05';
const day = (date, calories, protein_g = 100, extra = {}) => ({ date, calories, protein_g, carbs_g: 0, fat_g: 0, mood: null, moodScore: null, energy: null, sleepHours: null, sleepQuality: null, ...extra });
const w = (logged_date, weight, unit = 'kg') => ({ logged_date, weight, unit });
const sum = (over = {}) => weeklySummary({ dailyData: [], weightLogs: [], today: TODAY, targetFor: () => 2000, unit: 'kg', ...over });

describe('weeklySummary — food', () => {
  it('is null when the last seven days hold nothing', () => {
    expect(sum()).toBeNull();
    expect(sum({ dailyData: [day('2026-09-20', 2000)] })).toBeNull(); // older than two weeks
  });

  it('averages only days with food logged, over exactly the last seven days', () => {
    const s = sum({ dailyData: [
      day('2026-09-28', 9999), // 8 days ago — outside
      day('2026-09-29', 1800, 120), // first day of the window (today − 6)
      day('2026-10-01', 2200, 80),
      day('2026-10-02', 0, 0), // a day with only a check-in row
      day('2026-10-05', 2000, 100), // today — inside
    ] });
    expect(s.daysLogged).toBe(3);
    expect(s.avgCalories).toBe(2000);
    expect(s.avgProtein).toBe(100);
  });

  it('counts days within 10% of each day\'s own target', () => {
    const s = sum({
      targetFor: (date) => (date === '2026-10-03' ? 1500 : 2000), // a rest day
      dailyData: [day('2026-10-01', 2150), day('2026-10-02', 2300), day('2026-10-03', 1450), day('2026-10-04', 1700)],
    });
    expect(s.daysOnTarget).toBe(2); // 2150 and 1450; 2300 and 1700 are out
    expect(s.avgTarget).toBe(1875);
  });

  it('has no on-target count when there is no target', () => {
    const s = sum({ targetFor: () => null, dailyData: [day('2026-10-04', 2000)] });
    expect(s.daysOnTarget).toBeNull();
    expect(s.avgTarget).toBeNull();
  });

  it('compares with the week before only when both have food', () => {
    const both = sum({ dailyData: [day('2026-10-04', 2000), day('2026-09-28', 2300), day('2026-09-25', 2100)] });
    expect(both.caloriesVsLastWeek).toBe(-200);
    expect(sum({ dailyData: [day('2026-10-04', 2000)] }).caloriesVsLastWeek).toBeNull();
  });
});

describe('weeklySummary — weight', () => {
  it('compares the latest weigh-in with the latest from the week before', () => {
    const s = sum({ dailyData: [day('2026-10-04', 2000)], weightLogs: [w('2026-09-26', 80.2), w('2026-09-28', 80.4), w('2026-09-30', 80.0), w('2026-10-04', 79.6)] });
    // 28 Sep is the latest weigh-in before this week's window (29 Sep – 5 Oct); 30 Sep is inside it.
    expect(s.weight).toEqual({ change: -0.8, unit: 'kg', latest: 79.6 });
  });
  it('falls back to this week\'s first weigh-in, but needs two', () => {
    expect(sum({ weightLogs: [w('2026-09-30', 80), w('2026-10-04', 80.6)] }).weight.change).toBe(0.6);
    expect(sum({ dailyData: [day('2026-10-04', 2000)], weightLogs: [w('2026-10-04', 80)] }).weight).toBeNull();
  });
  it('converts between kg and lb', () => {
    const s = sum({ unit: 'lb', weightLogs: [w('2026-09-28', 80, 'kg'), w('2026-10-04', 79, 'kg')] });
    expect(s.weight.unit).toBe('lb');
    expect(s.weight.change).toBe(-2.2);
    const mixed = sum({ unit: 'kg', weightLogs: [w('2026-09-28', 176.4, 'lb'), w('2026-10-04', 79, 'kg')] });
    expect(mixed.weight.change).toBe(-1);
  });
  it('shows a week with only a weigh-in pair and no food', () => {
    const s = sum({ weightLogs: [w('2026-09-30', 80), w('2026-10-04', 79)] });
    expect(s).not.toBeNull();
    expect(s.daysLogged).toBe(0);
    expect(s.avgCalories).toBeNull();
  });
});

describe('weeklySummary — how you felt', () => {
  const felt = (date, extra) => day(date, 2000, 100, extra);
  it('averages mood, energy (on the 1–5 scale) and sleep once there are three answers', () => {
    const s = sum({ dailyData: [
      felt('2026-10-01', { moodScore: 5, energy: 10, sleepHours: 8, sleepQuality: 5 }),
      felt('2026-10-02', { moodScore: 3, energy: 6, sleepHours: 6.5, sleepQuality: 3 }),
      felt('2026-10-03', { moodScore: 4, energy: 8, sleepHours: 7, sleepQuality: 4 }),
    ] });
    expect(s.feel).toEqual({ mood: 4, energy: 4, sleepHours: 7.2, sleepQuality: 4 });
  });
  it('stays quiet with fewer than three answers, per measure', () => {
    const s = sum({ dailyData: [
      felt('2026-10-01', { moodScore: 5, sleepHours: 8 }),
      felt('2026-10-02', { moodScore: 3, sleepHours: 6 }),
    ] });
    expect(s.feel).toBeNull();
    const t = sum({ dailyData: [
      felt('2026-10-01', { moodScore: 5, sleepHours: 8 }),
      felt('2026-10-02', { moodScore: 3 }),
      felt('2026-10-03', { moodScore: 4 }),
    ] });
    expect(t.feel).toEqual({ mood: 4, energy: null, sleepHours: null, sleepQuality: null });
  });
  it('ignores answers from before this week', () => {
    const s = sum({ dailyData: [
      felt('2026-09-20', { moodScore: 1 }), felt('2026-09-21', { moodScore: 1 }), felt('2026-09-22', { moodScore: 1 }), felt('2026-10-04', { moodScore: 5 }),
    ] });
    expect(s.feel).toBeNull();
  });
});
