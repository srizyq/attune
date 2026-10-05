import { describe, it, expect } from 'vitest';
import { moodFor, energyToLevel, levelToEnergy, clampSleepHours, stepSleepHours, formatSleep, tileSummary, MOODS } from './dayCheckin';

describe('mood', () => {
  it('knows the five stored values and nothing else', () => {
    expect(MOODS.map((m) => m.id)).toEqual(['great', 'good', 'okay', 'low', 'tired']);
    expect(moodFor('good').label).toBe('Good');
    expect(moodFor('ecstatic')).toBeNull();
    expect(moodFor(4)).toBeNull(); // e2e fixtures once stored numbers here
    expect(moodFor(null)).toBeNull();
  });
});

describe('energy', () => {
  it('stores a 1–5 level on the existing 1–10 scale', () => {
    expect([1, 2, 3, 4, 5].map(levelToEnergy)).toEqual([2, 4, 6, 8, 10]);
  });
  it('reads any stored 1–10 value back to the nearest level', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(energyToLevel)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });
  it('round-trips every level the tile can write', () => {
    for (const l of [1, 2, 3, 4, 5]) expect(energyToLevel(levelToEnergy(l))).toBe(l);
  });
  it('is unset for null, empty or junk, and never leaves 1–5', () => {
    expect(energyToLevel(null)).toBeNull();
    expect(energyToLevel(undefined)).toBeNull();
    expect(energyToLevel('')).toBeNull();
    expect(energyToLevel('abc')).toBeNull();
    expect(energyToLevel(0)).toBe(1);
    expect(energyToLevel(40)).toBe(5);
  });
});

describe('sleep hours', () => {
  it('rounds to half hours and clamps to the range', () => {
    expect(clampSleepHours(7.2)).toBe(7);
    expect(clampSleepHours(7.3)).toBe(7.5);
    expect(clampSleepHours(-3)).toBe(0);
    expect(clampSleepHours(99)).toBe(16);
    expect(clampSleepHours('x')).toBeNull();
  });
  it('steps from the current value, or from 7 when nothing is set', () => {
    expect(stepSleepHours(7.5, 0.5)).toBe(8);
    expect(stepSleepHours(7.5, -0.5)).toBe(7);
    expect(stepSleepHours(null, 0.5)).toBe(7.5);
    expect(stepSleepHours(null, -0.5)).toBe(6.5);
    expect(stepSleepHours(16, 0.5)).toBe(16);
    expect(stepSleepHours(0, -0.5)).toBe(0);
    expect(stepSleepHours('6.5', 0.5)).toBe(7); // numeric columns come back as strings
  });
  it('formats hours and minutes', () => {
    expect(formatSleep(7.5)).toBe('7h 30m');
    expect(formatSleep('8.0')).toBe('8h');
    expect(formatSleep(0.5)).toBe('30m');
    expect(formatSleep(0)).toBe('0m');
    expect(formatSleep(null)).toBeNull();
    expect(formatSleep('')).toBeNull();
  });
});

describe('tileSummary', () => {
  it('is all null for an empty day', () => {
    expect(tileSummary(null)).toEqual({ mood: null, energy: null, sleep: null });
  });
  it('summarises what was answered', () => {
    expect(tileSummary({ mood: 'great', energy: 8, sleep_hours: '7.5', sleep_quality: 4 })).toEqual({ mood: '😄 Great', energy: '4/5', sleep: '7h 30m' });
  });
});
