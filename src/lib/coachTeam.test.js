import { describe, it, expect } from 'vitest';
import { clientCountLabel, inviteExpiry, shareableTeammates, validateTeamName, MAX_TEAM_NAME } from './coachTeam';

describe('clientCountLabel', () => {
  it('reads naturally at 0, 1 and many, and copes with junk', () => {
    expect(clientCountLabel(0)).toBe('No clients yet');
    expect(clientCountLabel(1)).toBe('1 client');
    expect(clientCountLabel(12)).toBe('12 clients');
    expect(clientCountLabel('3')).toBe('3 clients');
    expect(clientCountLabel(null)).toBe('No clients yet');
    expect(clientCountLabel(undefined)).toBe('No clients yet');
  });
});

describe('inviteExpiry', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  const at = (ms) => new Date(now.getTime() + ms).toISOString();
  it('describes how long is left', () => {
    expect(inviteExpiry(at(60 * 60 * 1000), now)).toBe('Expires today');
    expect(inviteExpiry(at(20 * 60 * 60 * 1000), now)).toBe('Expires tomorrow');
    expect(inviteExpiry(at(5 * 86400000 - 1000), now)).toBe('Expires in 5 days');
    expect(inviteExpiry(at(7 * 86400000), now)).toBe('Expires in 7 days');
  });
  it('says Expired at or after the deadline, and for junk', () => {
    expect(inviteExpiry(at(0), now)).toBe('Expired');
    expect(inviteExpiry(at(-1000), now)).toBe('Expired');
    expect(inviteExpiry('not a date', now)).toBe('Expired');
    expect(inviteExpiry(undefined, now)).toBe('Expired');
  });
});

describe('shareableTeammates', () => {
  const team = { members: [
    { user_id: 'me', name: 'Me', has_pass: true },
    { user_id: 'a', name: 'Ann', has_pass: true },
    { user_id: 'b', name: 'Bob', has_pass: false },
    { user_id: 'c', name: 'Cat', has_pass: true },
  ] };
  it('excludes yourself, anyone without a Coach Pass, and anyone already coaching (or invited)', () => {
    expect(shareableTeammates(team, 'me', []).map((m) => m.name)).toEqual(['Ann', 'Cat']);
    expect(shareableTeammates(team, 'me', [{ id: 'a', status: 'pending' }]).map((m) => m.name)).toEqual(['Cat']);
  });
  it('is empty with no team, no members, or nothing to offer', () => {
    expect(shareableTeammates(null, 'me', [])).toEqual([]);
    expect(shareableTeammates({}, 'me', undefined)).toEqual([]);
    expect(shareableTeammates({ members: [{ user_id: 'me', has_pass: true }] }, 'me', [])).toEqual([]);
  });
});

describe('validateTeamName', () => {
  it('trims and accepts a normal name', () => {
    expect(validateTeamName('  Northside Physio ')).toEqual({ name: 'Northside Physio', error: null });
  });
  it('rejects blank and over-long names, matching the database limit', () => {
    expect(validateTeamName('   ').error).toMatch(/Give the team a name/);
    expect(validateTeamName(null).error).toMatch(/Give the team a name/);
    expect(validateTeamName('x'.repeat(MAX_TEAM_NAME)).error).toBeNull();
    expect(validateTeamName('x'.repeat(MAX_TEAM_NAME + 1)).error).toMatch(/60 characters/);
  });
});
