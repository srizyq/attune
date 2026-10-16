// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetch: null }));
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { id: 'coach-1' } }) }));
vi.mock('../lib/db', async (orig) => ({ ...(await orig()), getRecentClientMessages: (...a) => h.fetch(...a) }));

import { useClientMessages } from './useCoach';

const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
const m = (client_id, sender_role, hoursAgo, body = 'hi') => ({ id: `${client_id}${sender_role}${hoursAgo}`, client_id, sender_role, body, created_at: iso(hoursAgo) });

beforeEach(() => { localStorage.clear(); h.fetch = vi.fn().mockResolvedValue([]); });
afterEach(() => vi.restoreAllMocks());

describe('useClientMessages', () => {
  it('reports unread messages per client, and a total', async () => {
    h.fetch.mockResolvedValue([m('a', 'client', 1, 'hello'), m('a', 'client', 2), m('b', 'client', 3)]);
    const { result } = renderHook(() => useClientMessages());
    await waitFor(() => expect(result.current.total).toBe(3));
    expect(result.current.unread.get('a')).toMatchObject({ unread: 2, latestBody: 'hello' });
  });

  it('on a device that has never been used, history older than a few days is not "unread"', async () => {
    h.fetch.mockResolvedValue([m('a', 'client', 24 * 30), m('a', 'client', 24 * 10), m('a', 'client', 2)]);
    const { result } = renderHook(() => useClientMessages());
    await waitFor(() => expect(result.current.total).toBe(1));
    expect(JSON.parse(localStorage.getItem('attune_coach_clients_seen_coach-1')).base).toBeTruthy(); // remembered
  });

  it('marking a client seen clears them, and it sticks after a reload', async () => {
    h.fetch.mockResolvedValue([m('a', 'client', 1), m('b', 'client', 1)]);
    const first = renderHook(() => useClientMessages());
    await waitFor(() => expect(first.result.current.total).toBe(2));
    act(() => first.result.current.markSeen('a'));
    expect([...first.result.current.unread.keys()]).toEqual(['b']);
    first.unmount();
    const second = renderHook(() => useClientMessages());
    await waitFor(() => expect(second.result.current.unread.has('b')).toBe(true));
    expect(second.result.current.unread.has('a')).toBe(false);
  });

  it('a message that arrives after they were marked seen is unread again', async () => {
    h.fetch.mockResolvedValue([m('a', 'client', 5)]);
    const { result } = renderHook(() => useClientMessages());
    await waitFor(() => expect(result.current.total).toBe(1));
    act(() => result.current.markSeen('a'));
    expect(result.current.total).toBe(0);
    h.fetch.mockResolvedValue([m('a', 'client', 5), { ...m('a', 'client', 0), created_at: new Date(Date.now() + 5000).toISOString() }]);
    await act(async () => { await result.current.refetch(); });
    expect(result.current.total).toBe(1);
  });

  it('makes no requests at all for someone who is not a coach', async () => {
    const { result } = renderHook(() => useClientMessages({ enabled: false }));
    await new Promise((r) => setTimeout(r, 30));
    expect(h.fetch).not.toHaveBeenCalled();
    expect(result.current.total).toBe(0);
  });

  it('a failed load keeps what it had instead of throwing', async () => {
    h.fetch.mockResolvedValueOnce([m('a', 'client', 1)]).mockRejectedValue(new Error('network'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = renderHook(() => useClientMessages());
    await waitFor(() => expect(result.current.total).toBe(1));
    await act(async () => { await result.current.refetch(); });
    expect(result.current.total).toBe(1);
  });
});
