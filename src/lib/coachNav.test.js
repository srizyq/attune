import { describe, it, expect, afterEach, vi } from 'vitest';
import { rememberCoachNav, isCoachNav } from './coachNav.js';

const store = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; } }; };
afterEach(() => vi.unstubAllGlobals());

describe('coach nav memory', () => {
  it('remembers a coach, and forgets when they are not one any more', () => {
    vi.stubGlobal('localStorage', store());
    expect(isCoachNav()).toBe(false);
    rememberCoachNav({ coach_pass: true });
    expect(isCoachNav()).toBe(true);
    rememberCoachNav({ coach_pass: false });
    expect(isCoachNav()).toBe(false);
  });

  it('a missing profile counts as not a coach, so a different account on this device is not shown the wrong tab', () => {
    vi.stubGlobal('localStorage', store());
    rememberCoachNav({ coach_pass: true });
    rememberCoachNav(null);
    expect(isCoachNav()).toBe(false);
  });

  it('does not throw when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } });
    expect(() => rememberCoachNav({ coach_pass: true })).not.toThrow();
    expect(isCoachNav()).toBe(false);
  });
});
