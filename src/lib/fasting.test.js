import { describe, it, expect } from 'vitest';
import { parseTargetHours, fastEndsAt, fastProgress, formatClock, formatDuration, formatHours, hitGoal, fastStage, FAST_STAGES, extendedTarget, fastStreak, weekSummary } from './fasting';

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

describe('fastStage', () => {
  const h = (n) => n * 3600000;
  it('starts at digesting and moves on by the hour', () => {
    expect(fastStage(0).key).toBe('fed');
    expect(fastStage(h(3.9)).key).toBe('fed');
    expect(fastStage(h(4)).key).toBe('settling');
    expect(fastStage(h(12)).key).toBe('extended');
    expect(fastStage(h(40)).key).toBe('long');
  });
  it('says what is next and how long until it', () => {
    const s = fastStage(h(3));
    expect(s.next.key).toBe('settling');
    expect(s.untilNextMs).toBe(h(1));
    expect(fastStage(h(40)).next).toBeNull();
  });
  it('never makes a fat-burning claim', () => {
    for (const s of FAST_STAGES) expect(`${s.title} ${s.note}`).not.toMatch(/fat[- ]?burn|ketosis|ketone|autophagy/i);
  });
});

describe('extendedTarget', () => {
  it('adds two hours by default and stops at the maximum', () => {
    expect(extendedTarget(16)).toBe(18);
    expect(extendedTarget('14.5')).toBe(16.5);
    expect(extendedTarget(71)).toBe(72);
    expect(extendedTarget(72)).toBe(72);
  });
});

describe('fastStreak and weekSummary', () => {
  // local noon so no timezone edge case moves a fast to another day
  const noon = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);
  const done = (end, hours = 16, ran = hours) => {
    const e = new Date(end);
    return { started_at: new Date(e.getTime() - ran * 3600000).toISOString(), ended_at: e.toISOString(), target_hours: hours };
  };
  const now = noon(2026, 10, 10).getTime();

  it('counts consecutive days that hit the goal, ending today or yesterday', () => {
    const fasts = [done(noon(2026, 10, 10)), done(noon(2026, 10, 9)), done(noon(2026, 10, 8))];
    expect(fastStreak(fasts, now)).toBe(3);
    expect(fastStreak(fasts.slice(1), now)).toBe(2); // today not done yet: yesterday still counts
  });
  it('is broken by a missed day, and by a fast that ended early', () => {
    expect(fastStreak([done(noon(2026, 10, 10)), done(noon(2026, 10, 8))], now)).toBe(1);
    expect(fastStreak([done(noon(2026, 10, 10), 16, 10), done(noon(2026, 10, 9))], now)).toBe(1);
    expect(fastStreak([done(noon(2026, 10, 7))], now)).toBe(0);
    expect(fastStreak([], now)).toBe(0);
  });
  it('summarises the last seven days', () => {
    const fasts = [done(noon(2026, 10, 10), 16, 18), done(noon(2026, 10, 9), 16, 10), done(noon(2026, 10, 5)), done(noon(2026, 9, 1))];
    const w = weekSummary(fasts, now);
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toMatchObject({ isToday: true, fasted: true, hit: true });
    expect(w.days[5]).toMatchObject({ fasted: true, hit: false });
    expect(w.days[1]).toMatchObject({ fasted: true, hit: true }); // 5 Oct
    expect(w.days[0].fasted).toBe(false); // 4 Oct
    expect(w.hitCount).toBe(2);
    expect(w.avgMs).toBeCloseTo(((18 + 10 + 16) / 3) * 3600000);
  });
  it('is empty and finite with no history', () => {
    const w = weekSummary([], now);
    expect(w.hitCount).toBe(0);
    expect(w.avgMs).toBe(0);
  });
  it('ignores a fast that is still running', () => {
    const w = weekSummary([{ started_at: new Date(now - 3600000).toISOString(), ended_at: null, target_hours: 16 }], now);
    expect(w.days.every((d) => !d.fasted)).toBe(true);
  });
});
