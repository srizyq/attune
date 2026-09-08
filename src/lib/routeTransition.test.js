import { describe, it, expect } from 'vitest';
import { locationChanged, isPageTransition } from './routeTransition';

describe('locationChanged', () => {
  it('is true for a same-route re-navigation carrying new state', () => {
    // The exact bug: a calendar day click calls navigate('/dashboard',
    // { state: { date } }) while already on /dashboard. react-router
    // still produces a new location object — if this returns false for
    // that case, AnimatedRoutes drops the update and the click silently
    // does nothing.
    const rendered = { pathname: '/dashboard', state: null };
    const next = { pathname: '/dashboard', state: { date: '2026-09-07' } };
    expect(locationChanged(next, rendered)).toBe(true);
  });

  it('is false when the location object is literally unchanged', () => {
    const location = { pathname: '/dashboard', state: null };
    expect(locationChanged(location, location)).toBe(false);
  });
});

describe('isPageTransition', () => {
  it('is false for a same-route re-navigation (state-only change)', () => {
    // This is what should gate the slide/fade animation — a same-route
    // update must still happen (see locationChanged above) but shouldn't
    // animate, since no page actually changed.
    const rendered = { pathname: '/dashboard', state: null };
    const next = { pathname: '/dashboard', state: { date: '2026-09-07' } };
    expect(isPageTransition(next, rendered)).toBe(false);
  });

  it('is true when the pathname actually changes', () => {
    const rendered = { pathname: '/dashboard', state: null };
    const next = { pathname: '/nutrients', state: null };
    expect(isPageTransition(next, rendered)).toBe(true);
  });
});
