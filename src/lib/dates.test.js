import { describe, it, expect } from 'vitest';
import { daysBetween } from './dates.js';

describe('daysBetween', () => {
  it('counts whole calendar days, immune to daylight saving', () => {
    expect(daysBetween('2026-09-17', '2026-09-20')).toBe(3);
    expect(daysBetween('2026-10-03', '2026-10-05')).toBe(2); // spans the AU DST change
    expect(daysBetween('2026-09-20', '2026-09-20')).toBe(0);
    expect(daysBetween('2026-09-20T23:59:59Z', '2026-09-21')).toBe(1);
  });
  it('is negative when the second date is earlier', () => {
    expect(daysBetween('2026-09-20', '2026-09-17')).toBe(-3);
  });
  it('returns NaN for garbage', () => {
    expect(daysBetween('x', '2026-09-20')).toBeNaN();
    expect(daysBetween(undefined, '2026-09-20')).toBeNaN();
  });
});
