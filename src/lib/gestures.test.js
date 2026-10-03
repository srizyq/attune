import { describe, it, expect } from 'vitest';
import { pullDistance, PULL_MAX, classifySwipe, shiftDate } from './gestures';

describe('pullDistance', () => {
  it('is 0 for no pull or an upward drag', () => {
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(-40)).toBe(0);
    expect(pullDistance(NaN)).toBe(0);
  });
  it('follows the finger with resistance, and caps', () => {
    expect(pullDistance(100)).toBeLessThan(100);
    expect(pullDistance(100)).toBeGreaterThan(pullDistance(50));
    expect(pullDistance(10000)).toBe(PULL_MAX);
  });
});

describe('classifySwipe', () => {
  const swipe = (o) => classifySwipe({ startX: 200, dx: 0, dy: 0, ms: 200, ...o });
  it('swipe right = previous day, swipe left = next day', () => {
    expect(swipe({ dx: 120 })).toBe('prev');
    expect(swipe({ dx: -120 })).toBe('next');
  });
  it('ignores short drags', () => {
    expect(swipe({ dx: 40 })).toBeNull();
    expect(swipe({ dx: -69 })).toBeNull();
  });
  it('ignores mostly-vertical drags (scrolling)', () => {
    expect(swipe({ dx: 100, dy: 90 })).toBeNull();
    expect(swipe({ dx: 100, dy: 40 })).toBe('prev');
  });
  it('ignores slow drags', () => {
    expect(swipe({ dx: 150, ms: 1500 })).toBeNull();
  });
  it('leaves the left edge strip alone', () => {
    expect(swipe({ startX: 10, dx: 150 })).toBeNull();
    expect(swipe({ startX: 24, dx: 150 })).toBe('prev');
  });
});

describe('shiftDate', () => {
  it('moves by days across month and year ends', () => {
    expect(shiftDate('2026-10-03', 1)).toBe('2026-10-04');
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('is not thrown by DST change dates', () => {
    expect(shiftDate('2026-10-04', 1)).toBe('2026-10-05');
    expect(shiftDate('2026-04-05', -1)).toBe('2026-04-04');
  });
});
