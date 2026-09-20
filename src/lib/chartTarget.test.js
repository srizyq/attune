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
