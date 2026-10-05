import { describe, it, expect } from 'vitest';
import { parseTargetHours, fastEndsAt, fastProgress, formatClock, formatDuration, formatHours, hitGoal } from './fasting';

const fast = (over = {}) => ({ started_at: '2026-10-05T20:00:00Z', target_hours: 16, ended_at: null, ...over });
const at = (iso) => new Date(iso).getTime();

describe('parseTargetHours', () => {
  it('accepts whole and half hours in range', () => {
    expect(parseTargetHours(16)).toBe(16);
    expect(parseTargetHours('18.5')).toBe(18.5);
    expect(parseTargetHours(' 12 ')).toBe(12);
    expect(parseTargetHours(72)).toBe(72);
    expect(parseTargetHours(1)).toBe(1);
  });
  it('rounds to the nearest half hour', () => {
    expect(parseTargetHours('16.2')).toBe(16);
    expect(parseTargetHours('16.3')).toBe(16.5);
  });
  it('refuses empty, non-numeric and out-of-range input', () => {
    for (const bad of ['', 'abc', NaN, 0, 0.4, 73, 200, -5, Infinity]) expect(parseTargetHours(bad)).toBeNull();
  });
});

describe('fastEndsAt', () => {
  it('is start plus the goal', () => {
    expect(fastEndsAt(fast()).toISOString()).toBe('2026-10-06T12:00:00.000Z');
    expect(fastEndsAt(fast({ target_hours: '14.5' })).toISOString()).toBe('2026-10-06T10:30:00.000Z');
  });
});

describe('fastProgress', () => {
  it('is partway through a running fast', () => {
    const p = fastProgress(fast(), at('2026-10-06T04:00:00Z'));
    expect(p.elapsedMs).toBe(8 * 3600000);
    expect(p.pct).toBeCloseTo(0.5);
    expect(p.done).toBe(false);
    expect(p.remainingMs).toBe(8 * 3600000);
    expect(p.overMs).toBe(0);
  });
  it('is done exactly at the goal, and reports time over it afterwards', () => {
    expect(fastProgress(fast(), at('2026-10-06T12:00:00Z')).done).toBe(true);
    const p = fastProgress(fast(), at('2026-10-06T14:30:00Z'));
    expect(p.done).toBe(true);
    expect(p.pct).toBe(1);
    expect(p.overMs).toBe(2.5 * 3600000);
    expect(p.remainingMs).toBe(0);
  });
  it('is not done one second early', () => {
    expect(fastProgress(fast(), at('2026-10-06T11:59:59Z')).done).toBe(false);
  });
  it('measures a finished fast to its end, not to now', () => {
    const p = fastProgress(fast({ ended_at: '2026-10-06T06:00:00Z' }), at('2026-12-01T00:00:00Z'));
    expect(p.elapsedMs).toBe(10 * 3600000);
  });
  it('never goes negative if the clock is behind the start', () => {
    expect(fastProgress(fast(), at('2026-10-05T19:00:00Z')).elapsedMs).toBe(0);
  });
});

describe('formatting', () => {
  it('formats the live clock', () => {
    expect(formatClock(0)).toBe('0:00:00');
    expect(formatClock((14 * 3600 + 32 * 60 + 8) * 1000)).toBe('14:32:08');
    expect(formatClock(-5000)).toBe('0:00:00');
    expect(formatClock((100 * 3600) * 1000)).toBe('100:00:00');
  });
  it('formats durations', () => {
    expect(formatDuration(45 * 60000)).toBe('45m');
    expect(formatDuration(16 * 3600000)).toBe('16h');
    expect(formatDuration((14 * 60 + 32) * 60000)).toBe('14h 32m');
    expect(formatDuration(0)).toBe('0m');
  });
  it('formats goals', () => {
    expect(formatHours(16)).toBe('16h');
    expect(formatHours('16.0')).toBe('16h');
    expect(formatHours(14.5)).toBe('14.5h');
  });
});

describe('hitGoal', () => {
  it('is true only when a finished fast ran at least the goal', () => {
    expect(hitGoal(fast({ ended_at: '2026-10-06T12:00:00Z' }))).toBe(true);
    expect(hitGoal(fast({ ended_at: '2026-10-06T11:59:00Z' }))).toBe(false);
    expect(hitGoal(fast({ ended_at: '2026-10-06T20:00:00Z' }))).toBe(true);
  });
});
