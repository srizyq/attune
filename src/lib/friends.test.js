// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { normalizeFriendCode, friendLink, initialsOf, stashPendingFriend, takePendingFriend, friendlyFriendsError, friendsUnavailable, getMyFriendInfo, listFriends, getFriendDay, getAllFriendRecipes, SHARE_LEVELS } from './friends';

// Each rpc answers from this table; a function missing from it behaves like a database that hasn't had the update.
const answers = {};
vi.mock('./supabase', () => ({
  supabase: { rpc: (name, args) => {
    const a = answers[name];
    if (a === undefined) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } });
    if (a instanceof Error) return Promise.resolve({ data: null, error: a });
    return Promise.resolve({ data: typeof a === 'function' ? a(args) : a, error: null });
  } },
}));

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

describe('sharing levels', () => {
  beforeEach(() => { for (const k of Object.keys(answers)) delete answers[k]; });

  it('offers the three levels in order', () => {
    expect(SHARE_LEVELS.map((l) => l.id)).toEqual(['full', 'totals', 'private']);
  });

  it('reads the level from the updated database', async () => {
    answers.friends_me = [{ invite_code: 'ABC', share_day: true, share_level: 'totals' }];
    expect(await getMyFriendInfo()).toEqual({ code: 'ABC', shareDay: true, shareLevel: 'totals', levelsSupported: true });
  });

  it('works out the level from on/off on the older database', async () => {
    answers.friends_me = [{ invite_code: 'ABC', share_day: false }];
    expect(await getMyFriendInfo()).toMatchObject({ shareLevel: 'private', shareDay: false, levelsSupported: false });
    answers.friends_me = [{ invite_code: 'ABC', share_day: true }];
    expect(await getMyFriendInfo()).toMatchObject({ shareLevel: 'full', levelsSupported: false });
  });

  it('gives each listed friend a level, from the database or worked out from hidden', async () => {
    answers.friends_list = [
      { friend_id: 'a', name: 'A', hidden: false, items: 2, calories: 100, level: 'totals' },
      { friend_id: 'b', name: 'B', hidden: true, items: 0, level: 'none' },
      { friend_id: 'c', name: 'C', hidden: true, items: 0 },
      { friend_id: 'd', name: 'D', hidden: false, items: 1, calories: 5 },
    ];
    const rows = await listFriends('2026-10-16');
    expect(rows.map((r) => r.level)).toEqual(['totals', 'none', 'none', 'full']);
    expect(rows[1].totals).toBeNull();
  });

  it('reads a friend\'s day, including the totals a totals-only friend shares', async () => {
    answers.friends_day = { name: 'Bo', hidden: false, level: 'totals', totals: { items: 2, calories: 700, protein_g: 28, carbs_g: 82, fat_g: 23 }, targets: {}, logs: [] };
    const d = await getFriendDay('b', '2026-10-16');
    expect(d).toMatchObject({ level: 'totals', hidden: false, items: [], totals: { items: 2, calories: 700, protein: 28, carbs: 82, fat: 23 } });
    answers.friends_day = { name: 'Bo', hidden: true, targets: {}, logs: [] }; // older database
    expect(await getFriendDay('b', '2026-10-16')).toMatchObject({ level: 'none', totals: null });
  });
});

describe('every friend\'s shared recipes', () => {
  beforeEach(() => { for (const k of Object.keys(answers)) delete answers[k]; });

  it('merges them newest first, each with who shared it', async () => {
    answers.friends_recipes = ({ p_friend }) => (p_friend === 'a'
      ? [{ id: 'r1', name: 'Old', items: [], servings: 1, created_at: '2026-10-01T00:00:00Z', photo_path: 'a/p.jpg', prep_minutes: 5, tags: ['Dessert'] }]
      : [{ id: 'r2', name: 'New', items: [], servings: 2, created_at: '2026-10-09T00:00:00Z' }]);
    const rows = await getAllFriendRecipes([{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }]);
    expect(rows.map((r) => [r.name, r.friendName])).toEqual([['New', 'Bo'], ['Old', 'Ann']]);
    expect(rows[1]).toMatchObject({ photoPath: 'a/p.jpg', prepMinutes: 5, tags: ['Dessert'] });
    expect(rows[0]).toMatchObject({ photoPath: null, prepMinutes: null, tags: [] }); // older database: no extras
  });

  it('skips a friend whose recipes fail to load instead of failing them all', async () => {
    answers.friends_recipes = ({ p_friend }) => { if (p_friend === 'a') throw new Error('x'); return [{ id: 'r2', name: 'New', items: [], servings: 1 }]; };
    const rows = await getAllFriendRecipes([{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }]);
    expect(rows.map((r) => r.name)).toEqual(['New']);
  });

  it('is empty with no friends', async () => {
    expect(await getAllFriendRecipes([])).toEqual([]);
  });
});
