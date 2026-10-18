// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { recordRecentError, getRecentErrors, _resetRecentErrors } from './recentErrors';

beforeEach(() => _resetRecentErrors());

describe('recent errors', () => {
  it('keeps messages, joined and clipped, newest last', () => {
    recordRecentError('Failed to log recipe:', new Error('network down'));
    recordRecentError('x'.repeat(500));
    const list = getRecentErrors();
    expect(list[0]).toBe('Failed to log recipe: network down');
    expect(list[1]).toHaveLength(300);
  });
  it('ignores objects and empty calls, and a repeat of the last one', () => {
    recordRecentError({ secret: 'food data' });
    recordRecentError('');
    recordRecentError('same'); recordRecentError('same');
    expect(getRecentErrors()).toEqual(['same']);
  });
  it('keeps only the last ten', () => {
    for (let i = 0; i < 14; i++) recordRecentError(`error ${i}`);
    const list = getRecentErrors();
    expect(list).toHaveLength(10);
    expect(list[0]).toBe('error 4');
    expect(list.at(-1)).toBe('error 13');
  });
  it('is still there after a reload', () => {
    recordRecentError('before the reload');
    // a fresh module state reads sessionStorage
    expect(JSON.parse(sessionStorage.getItem('attune_recent_errors'))).toEqual(['before the reload']);
  });
});
