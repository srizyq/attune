// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { normalizeFriendCode, friendLink, initialsOf, stashPendingFriend, takePendingFriend, friendlyFriendsError, friendsUnavailable } from './friends';

describe('friend codes and links', () => {
  it('keeps just the letters and digits, upper-cased', () => {
    expect(normalizeFriendCode(' ab12-cd34 ef ')).toBe('AB12CD34EF');
    expect(normalizeFriendCode(null)).toBe('');
  });
  it('builds the invite link from the origin and code', () => {
    expect(friendLink('https://attun3.com/', 'ab12cd34ef')).toBe('https://attun3.com/friends/join/AB12CD34EF');
  });
});

describe('initialsOf', () => {
  it('takes up to two initials', () => {
    expect(initialsOf('sriram reddy')).toBe('SR');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('a b c')).toBe('AB');
    expect(initialsOf('')).toBe('?');
  });
});

describe('the pending invite stash', () => {
  beforeEach(() => localStorage.clear());
  it('hands a stashed code back once', () => {
    stashPendingFriend('ab12cd34ef');
    expect(takePendingFriend()).toBe('AB12CD34EF');
    expect(takePendingFriend()).toBeNull();
  });
  it('ignores an empty code', () => {
    stashPendingFriend('  ');
    expect(takePendingFriend()).toBeNull();
  });
});

describe('error wording', () => {
  it('explains each known failure in plain words', () => {
    expect(friendlyFriendsError({ message: 'friends_invalid_code' })).toMatch(/isn't valid/);
    expect(friendlyFriendsError({ message: 'friends_self' })).toMatch(/your own link/);
    expect(friendlyFriendsError({ message: 'friends_not_friends' })).toMatch(/aren't friends/);
    expect(friendlyFriendsError({ message: 'community_rate_limited' })).toMatch(/tomorrow/);
    expect(friendlyFriendsError({ message: 'boom' })).toMatch(/went wrong/);
  });
  it('knows when the database update has not been run', () => {
    const err = { code: 'PGRST202', message: 'Could not find the function public.friends_me' };
    expect(friendsUnavailable(err)).toBe(true);
    expect(friendlyFriendsError(err)).toMatch(/isn't switched on/);
    expect(friendsUnavailable({ message: 'friends_self' })).toBe(false);
  });
});
