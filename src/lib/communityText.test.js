import { describe, it, expect } from 'vitest';
import { checkUsername, checkBio, checkNote, checkDisplayName, normalizeUsername, hasProfanity, validateProfileText, validateNote, ageFromProfile, ageGate } from './communityText.js';

describe('usernames', () => {
  it('normalises case, spaces and a leading @', () => {
    expect(normalizeUsername('  @Maya.K ')).toBe('maya.k');
  });
  it('accepts good ones and says what is wrong with bad ones', () => {
    for (const ok of ['maya.k', 'jt99', 'p_mod', 'abc', 'a'.repeat(20)]) expect(checkUsername(ok), ok).toBeNull();
    expect(checkUsername('ab')).toMatch(/at least 3/);
    expect(checkUsername('a'.repeat(21))).toMatch(/at most 20/);
    expect(checkUsername('has space')).toMatch(/letters, numbers/);
    expect(checkUsername('_lead')).toMatch(/letters, numbers/);
    expect(checkUsername('trail.')).toMatch(/letters, numbers/);
    expect(checkUsername('Admin')).toMatch(/reserved/);
  });
});

describe('bios, notes and names', () => {
  it('blocks links and long text', () => {
    expect(checkBio('Meal prep Sundays')).toBeNull();
    expect(checkBio('see www.mysite')).toMatch(/Links/);
    expect(checkBio('shop at x.com')).toMatch(/Links/);
    expect(checkBio('x'.repeat(161))).toMatch(/160/);
    expect(checkNote('tasty')).toBeNull();
    expect(checkNote('buy at https://x.example')).toMatch(/Links/);
    expect(checkNote('go to deals.co now')).toMatch(/Links/);
    expect(checkNote('1.5 cups of oats')).toBeNull();
    expect(checkNote('x'.repeat(201))).toMatch(/200/);
    expect(checkDisplayName('')).toMatch(/name/);
    expect(checkDisplayName('Alex')).toBeNull();
  });
});

describe('word filter', () => {
  it('catches abuse but not ordinary food words', async () => {
    expect(await hasProfanity('Grilled chicken breast with rice')).toBe(false);
    expect(await hasProfanity('Scunthorpe cheese pie')).toBe(false);
    expect(await hasProfanity('what the fuck')).toBe(true);
    expect(await hasProfanity('')).toBe(false);
  });
  it('validateProfileText and validateNote use it', async () => {
    expect(await validateProfileText({ username: 'maya.k', displayName: 'Maya', bio: 'Cutting.' })).toEqual({});
    expect(Object.keys(await validateProfileText({ username: 'ab', displayName: '', bio: 'x.com' })).sort()).toEqual(['bio', 'displayName', 'username']);
    expect((await validateProfileText({ username: 'maya.k', displayName: 'Maya', bio: 'fuck you' })).bio).toMatch(/abusive/);
    expect(await validateNote('lovely lunch')).toBeNull();
    expect(await validateNote('fuck this')).toMatch(/abusive/);
  });
});

describe('age gate', () => {
  const today = new Date('2026-10-06T12:00:00');
  it('uses date of birth first, then the stored age', () => {
    expect(ageFromProfile({ date_of_birth: '2010-10-07' }, today)).toBe(15);
    expect(ageFromProfile({ date_of_birth: '2010-10-06' }, today)).toBe(16);
    expect(ageFromProfile({ age: 30 }, today)).toBe(30);
    expect(ageFromProfile({}, today)).toBeNull();
    expect(ageGate({ age: 15 }, today)).toBe('too_young');
    expect(ageGate({ age: 16 }, today)).toBe('ok');
    expect(ageGate({}, today)).toBe('unknown');
    expect(ageGate(null, today)).toBe('unknown');
  });
});
