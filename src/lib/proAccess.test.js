import { describe, it, expect } from 'vitest';
import { hasProAccess, withCoachProAccess } from './proAccess';

describe('hasProAccess', () => {
  it('is true for a real/comp/trial-granted Pro account', () => {
    expect(hasProAccess({ is_premium: true })).toBe(true);
  });
  it('is true for a Coach Pass holder, even with no is_premium of their own', () => {
    expect(hasProAccess({ coach_pass: true })).toBe(true);
  });
  it('is true with both', () => {
    expect(hasProAccess({ is_premium: true, coach_pass: true })).toBe(true);
  });
  it('is false with neither, or no profile at all', () => {
    expect(hasProAccess({ is_premium: false, coach_pass: false })).toBe(false);
    expect(hasProAccess({})).toBe(false);
    expect(hasProAccess(null)).toBe(false);
    expect(hasProAccess(undefined)).toBe(false);
  });
});

describe('withCoachProAccess', () => {
  it('folds coach_pass into is_premium, so a plain is_premium check still works downstream', () => {
    expect(withCoachProAccess({ coach_pass: true, is_premium: false }).is_premium).toBe(true);
  });
  it('leaves every other field on the profile untouched', () => {
    const result = withCoachProAccess({ coach_pass: true, is_premium: false, name: 'Sam', photo_scans_used: 3 });
    expect(result).toEqual({ coach_pass: true, is_premium: true, name: 'Sam', photo_scans_used: 3 });
  });
  it('is a no-op (returns the same object) for an account with no coach_pass, real Pro or not', () => {
    const realPro = { is_premium: true, coach_pass: false };
    expect(withCoachProAccess(realPro)).toBe(realPro);
    const free = { is_premium: false, coach_pass: false };
    expect(withCoachProAccess(free)).toBe(free);
  });
  it('passes through null/undefined safely', () => {
    expect(withCoachProAccess(null)).toBeNull();
    expect(withCoachProAccess(undefined)).toBeUndefined();
  });
});
