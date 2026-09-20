import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  normalizeInviteCode, extractInviteCode, inviteLink, inviteState, daysLeft,
  stashPendingInvite, takePendingInvite, isMissingFunctionError,
} from './coachInvite.js';

describe('normalizeInviteCode', () => {
  it('uppercases and strips spaces, dashes and punctuation', () => {
    expect(normalizeInviteCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeInviteCode('ab cd\n23')).toBe('ABCD23');
  });
  it('survives null/undefined/numbers and caps runaway input', () => {
    expect(normalizeInviteCode(null)).toBe('');
    expect(normalizeInviteCode(undefined)).toBe('');
    expect(normalizeInviteCode(1234)).toBe('1234');
    expect(normalizeInviteCode('A'.repeat(500))).toHaveLength(32);
  });
});

describe('extractInviteCode', () => {
  it('reads the code out of a pasted link, with query strings or a trailing slash', () => {
    expect(extractInviteCode('https://attun3.com/join/abcd2345')).toBe('ABCD2345');
    expect(extractInviteCode('https://attun3.com/join/ABCD2345/?utm=x')).toBe('ABCD2345');
    expect(extractInviteCode('  attun3.com/join/ABCD2345#top ')).toBe('ABCD2345');
  });
  it('treats anything else as a bare code', () => {
    expect(extractInviteCode('abcd 2345')).toBe('ABCD2345');
    expect(extractInviteCode('')).toBe('');
  });
});

describe('inviteLink', () => {
  it('builds a join URL regardless of a trailing slash on the origin', () => {
    expect(inviteLink('https://attun3.com', 'abcd2345')).toBe('https://attun3.com/join/ABCD2345');
    expect(inviteLink('https://attun3.com/', 'ABCD2345')).toBe('https://attun3.com/join/ABCD2345');
  });
  it('round-trips through extractInviteCode', () => {
    expect(extractInviteCode(inviteLink('https://x.test', 'zz99yy88'))).toBe('ZZ99YY88');
  });
});

describe('inviteState / daysLeft', () => {
  const now = new Date('2026-09-20T00:00:00Z').getTime();
  const base = { redeemed_at: null, revoked_at: null, expires_at: '2026-09-25T00:00:00Z' };
  it('classifies an invite', () => {
    expect(inviteState(base, now)).toBe('open');
    expect(inviteState({ ...base, expires_at: '2026-09-19T00:00:00Z' }, now)).toBe('expired');
    expect(inviteState({ ...base, revoked_at: '2026-09-19T00:00:00Z' }, now)).toBe('revoked');
    expect(inviteState({ ...base, redeemed_at: '2026-09-19T00:00:00Z', expires_at: '2026-09-19T00:00:00Z' }, now)).toBe('redeemed');
  });
  it('rounds days left up and never goes negative', () => {
    expect(daysLeft(base, now)).toBe(5);
    expect(daysLeft({ ...base, expires_at: '2026-09-20T05:00:00Z' }, now)).toBe(1);
    expect(daysLeft({ ...base, expires_at: '2026-09-01T00:00:00Z' }, now)).toBe(0);
  });
});

describe('pending invite stash', () => {
  beforeEach(() => {
    const store = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    });
  });
  it('is taken exactly once', () => {
    stashPendingInvite('abcd 2345');
    expect(takePendingInvite()).toBe('ABCD2345');
    expect(takePendingInvite()).toBeNull();
  });
  it('ignores empty codes', () => {
    stashPendingInvite('   ');
    expect(takePendingInvite()).toBeNull();
  });
  it('does not throw when storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } });
    expect(() => stashPendingInvite('ABCD2345')).not.toThrow();
    expect(takePendingInvite()).toBeNull();
  });
});

describe('isMissingFunctionError', () => {
  it('recognises "function not deployed yet" errors and nothing else', () => {
    expect(isMissingFunctionError({ code: 'PGRST202', message: 'x' })).toBe(true);
    expect(isMissingFunctionError({ code: '42883', message: 'x' })).toBe(true);
    expect(isMissingFunctionError({ message: 'Could not find the function public.foo() in the schema cache' })).toBe(true);
    expect(isMissingFunctionError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isMissingFunctionError({ message: 'That invite code is invalid or no longer active' })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});
