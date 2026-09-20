import { describe, it, expect } from 'vitest';
import { targetLineSegments } from './chartTarget';

const day = (caloriesBurned = 0) => ({ caloriesBurned });

describe('targetLineSegments', () => {
  it('no workouts: one continuous segment across every day', () => {
    expect(targetLineSegments([day(), day(), day(), day()], 2000)).toEqual([{ start: 0, end: 3, value: 2000 }]);
  });
  it('a workout day breaks the line and rises on its own', () => {
    expect(targetLineSegments([day(), day(), day(300), day(), day()], 2000)).toEqual([
      { start: 0, end: 1, value: 2000 },
      { start: 2, end: 2, value: 2300 },
      { start: 3, end: 4, value: 2000 },
    ]);
  });
  it('workout on the first / last day leaves no empty base segment', () => {
    expect(targetLineSegments([day(200), day(), day()], 1800)).toEqual([
      { start: 0, end: 0, value: 2000 },
      { start: 1, end: 2, value: 1800 },
    ]);
    expect(targetLineSegments([day(), day(), day(200)], 1800)).toEqual([
      { start: 0, end: 1, value: 1800 },
      { start: 2, end: 2, value: 2000 },
    ]);
  });
  it('consecutive workout days each get their own raised segment', () => {
    expect(targetLineSegments([day(100), day(250)], 2000)).toEqual([
      { start: 0, end: 0, value: 2100 },
      { start: 1, end: 1, value: 2250 },
    ]);
  });
  it('every day a workout: no base line at all', () => {
    expect(targetLineSegments([day(50), day(50)], 2000).every(s => s.start === s.end)).toBe(true);
  });
  it('missing / garbage burned values count as no workout; empty chart is empty', () => {
    expect(targetLineSegments([{}, { caloriesBurned: 'x' }, { caloriesBurned: null }], 2000)).toEqual([{ start: 0, end: 2, value: 2000 }]);
    expect(targetLineSegments([], 2000)).toEqual([]);
  });
});

describe('targetLineSegments with per-day base targets (rest days)', () => {
  const d = (baseTarget, caloriesBurned = 0) => ({ baseTarget, caloriesBurned });
  it('steps the line where the target changes, and keeps a run of equal days as one segment', () => {
    expect(targetLineSegments([d(2500), d(2500), d(1800), d(1800), d(2500)], 2000)).toEqual([
      { start: 0, end: 1, value: 2500 },
      { start: 2, end: 3, value: 1800 },
      { start: 4, end: 4, value: 2500 },
    ]);
  });
  it('a workout on a rest day raises that day\'s own base', () => {
    expect(targetLineSegments([d(2500), d(1800, 300), d(1800)], 2000)).toEqual([
      { start: 0, end: 0, value: 2500 },
      { start: 1, end: 1, value: 2100 },
      { start: 2, end: 2, value: 1800 },
    ]);
  });
  it('a day without its own base uses the shared one, so old callers are unchanged', () => {
    expect(targetLineSegments([{}, d(undefined), d(null), d(2000)], 2000)).toEqual([{ start: 0, end: 3, value: 2000 }]);
  });
  it('a zero base target is honoured, not replaced by the fallback', () => {
    expect(targetLineSegments([d(0), d(0)], 2000)).toEqual([{ start: 0, end: 1, value: 0 }]);
  });
});

