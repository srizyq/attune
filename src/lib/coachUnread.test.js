import { describe, it, expect, afterEach, vi } from 'vitest';
import { unreadByClient, totalUnread, markClientSeen, firstRunSeen, loadSeen, saveSeen, FIRST_RUN_DAYS } from './coachUnread.js';

const NOW = Date.parse('2026-10-16T03:00:00Z');
const iso = (hoursAgo) => new Date(NOW - hoursAgo * 3600000).toISOString();
const msg = (client_id, sender_role, hoursAgo, body = 'hi') => ({ id: `${client_id}-${sender_role}-${hoursAgo}`, client_id, sender_role, body, created_at: iso(hoursAgo) });
const seen = (over = {}) => ({ base: iso(24 * 30), clients: {}, ...over });

describe('unreadByClient', () => {
  it('counts a client\'s messages the coach has not looked at, and shows the newest', () => {
    const r = unreadByClient([msg('a', 'client', 5, 'old'), msg('a', 'client', 1, 'newest'), msg('b', 'client', 2)], seen());
    expect(r.get('a')).toEqual({ unread: 2, latestAt: iso(1), latestBody: 'newest' });
    expect(r.get('b').unread).toBe(1);
    expect(totalUnread(r)).toBe(3);
  });

  it('stops counting a client\'s messages once the coach has opened their messages', () => {
    const s = markClientSeen(seen(), 'a', NOW - 3 * 3600000);
    const r = unreadByClient([msg('a', 'client', 5), msg('a', 'client', 1), msg('b', 'client', 2)], s);
    expect(r.get('a').unread).toBe(1); // only the one that arrived after they looked
    expect(r.get('b').unread).toBe(1);
  });

  it('treats a reply from the coach as having read everything before it', () => {
    const r = unreadByClient([msg('a', 'client', 6), msg('a', 'client', 5), msg('a', 'trainer', 4, 'on it'), msg('a', 'client', 1, 'thanks!')], seen());
    expect(r.get('a')).toEqual({ unread: 1, latestAt: iso(1), latestBody: 'thanks!' });
  });

  it('has nothing for a client who has not written, or only the coach has', () => {
    expect(unreadByClient([msg('a', 'trainer', 2)], seen()).size).toBe(0);
    expect(unreadByClient([], seen()).size).toBe(0);
  });

  it('ignores everything before the baseline (history from before this was used)', () => {
    const r = unreadByClient([msg('a', 'client', 24 * 10), msg('a', 'client', 2)], seen({ base: iso(24 * 3) }));
    expect(r.get('a').unread).toBe(1);
  });

  it('keeps clients separate: looking at one does not clear another', () => {
    const s = markClientSeen(seen(), 'a');
    const r = unreadByClient([msg('a', 'client', 1), msg('b', 'client', 1)], { ...s, clients: { a: new Date(NOW + 1000).toISOString() } });
    expect([...r.keys()]).toEqual(['b']);
  });
});

describe('first run on a device', () => {
  it('only the last few days count, so a coach\'s whole history is not "unread"', () => {
    const s = firstRunSeen(NOW);
    expect(Date.parse(s.base)).toBe(NOW - FIRST_RUN_DAYS * 86400000);
    const r = unreadByClient([msg('a', 'client', 24 * 20), msg('a', 'client', 24 * 5), msg('a', 'client', 24)], s);
    expect(r.get('a').unread).toBe(1);
  });
});

describe('remembering what was seen', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('round-trips through storage, per coach, and survives bad data', () => {
    const store = {};
    vi.stubGlobal('localStorage', { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } });
    expect(loadSeen('t1')).toBeNull();
    saveSeen('t1', seen());
    expect(loadSeen('t1').clients).toEqual({});
    expect(loadSeen('t2')).toBeNull();
    store['attune_coach_clients_seen_t3'] = '{not json';
    expect(loadSeen('t3')).toBeNull();
    store['attune_coach_clients_seen_t4'] = JSON.stringify({ nope: 1 });
    expect(loadSeen('t4')).toBeNull();
  });
  it('is harmless when storage is unavailable', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(loadSeen('t1')).toBeNull();
    expect(() => saveSeen('t1', seen())).not.toThrow();
  });
});
