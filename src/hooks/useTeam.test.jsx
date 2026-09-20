// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ auth: null, db: {} }));
vi.mock('./useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/db', () => h.db);
import { useTeam, useClientCoaches } from './useTeam';

const USER = { user: { id: 'me' } }; // one stable object, so effects don't re-run every render
beforeEach(() => {
  h.auth = USER;
  Object.assign(h.db, {
    getMyTeam: vi.fn().mockResolvedValue({ supported: true, team: { id: 't1', name: 'Clinic', members: [] } }),
    createCoachTeam: vi.fn().mockResolvedValue('t1'), createTeamInvite: vi.fn().mockResolvedValue({}), revokeTeamInvite: vi.fn().mockResolvedValue(),
    redeemTeamInvite: vi.fn().mockResolvedValue('t1'), leaveCoachTeam: vi.fn().mockResolvedValue(), removeTeamMember: vi.fn().mockResolvedValue(),
    deleteCoachTeam: vi.fn().mockResolvedValue(),
    getClientCoaches: vi.fn().mockResolvedValue({ supported: true, coaches: [{ id: 'a', name: 'Ann', status: 'pending' }] }),
    shareClientWithTeammate: vi.fn().mockResolvedValue('link1'),
  });
});

describe('useTeam', () => {
  it('loads the team', async () => {
    const { result } = renderHook(() => useTeam());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ supported: true, team: { name: 'Clinic' } });
  });

  it('is not supported (and does not crash) before the database update', async () => {
    h.db.getMyTeam.mockResolvedValue({ supported: false, team: null });
    const { result } = renderHook(() => useTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ supported: false, team: null });
  });

  it('survives a failed load with an empty, usable state', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.db.getMyTeam.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.team).toBeNull();
    expect(result.current.supported).toBe(true);
    spy.mockRestore();
  });

  it('does nothing without a signed-in user', async () => {
    h.auth = { user: null };
    const { result } = renderHook(() => useTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(h.db.getMyTeam).not.toHaveBeenCalled();
    expect(result.current.team).toBeNull();
  });

  it('every action calls the database and then refetches, returning the result', async () => {
    const { result } = renderHook(() => useTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const actions = [
      ['create', 'createCoachTeam', ['Clinic']], ['join', 'redeemTeamInvite', ['ABCD2345']], ['leave', 'leaveCoachTeam', []],
      ['remove', 'removeTeamMember', ['u1']], ['disband', 'deleteCoachTeam', []], ['invite', 'createTeamInvite', [7]], ['revokeInvite', 'revokeTeamInvite', ['i1']],
    ];
    for (const [action, fn, args] of actions) {
      const before = h.db.getMyTeam.mock.calls.length;
      await act(async () => { await result.current[action](...args); });
      expect(h.db[fn], action).toHaveBeenCalledWith(...args);
      expect(h.db.getMyTeam.mock.calls.length, `${action} refetches`).toBe(before + 1);
    }
  });

  it('a refused action rejects to the caller and does not refetch', async () => {
    h.db.createTeamInvite.mockRejectedValue(new Error('Only the team owner can invite people'));
    const { result } = renderHook(() => useTeam());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = h.db.getMyTeam.mock.calls.length;
    await expect(act(async () => { await result.current.invite(); })).rejects.toThrow('Only the team owner');
    expect(h.db.getMyTeam.mock.calls.length).toBe(before);
  });
});

describe('useClientCoaches', () => {
  it('loads the co-coaches for a client', async () => {
    const { result } = renderHook(() => useClientCoaches('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.coaches).toEqual([{ id: 'a', name: 'Ann', status: 'pending' }]);
    expect(h.db.getClientCoaches).toHaveBeenCalledWith('c1');
  });

  it('is empty and unsupported before the update, and empty with no client', async () => {
    h.db.getClientCoaches.mockResolvedValue({ supported: false, coaches: [] });
    const a = renderHook(() => useClientCoaches('c1'));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(a.result.current).toMatchObject({ supported: false, coaches: [] });
    const b = renderHook(() => useClientCoaches(null));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.coaches).toEqual([]);
  });

  it('reloads when the client changes', async () => {
    const { result, rerender } = renderHook(({ id }) => useClientCoaches(id), { initialProps: { id: 'c1' } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    h.db.getClientCoaches.mockResolvedValue({ supported: true, coaches: [] });
    rerender({ id: 'c2' });
    await waitFor(() => expect(h.db.getClientCoaches).toHaveBeenLastCalledWith('c2'));
    await waitFor(() => expect(result.current.coaches).toEqual([]));
  });

  it('sharing calls the database, then refetches', async () => {
    const { result } = renderHook(() => useClientCoaches('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = h.db.getClientCoaches.mock.calls.length;
    await act(async () => { await result.current.share('u2'); });
    expect(h.db.shareClientWithTeammate).toHaveBeenCalledWith('c1', 'u2');
    expect(h.db.getClientCoaches.mock.calls.length).toBe(before + 1);
  });

  it('a refused share rejects to the caller (so the card can show why)', async () => {
    h.db.shareClientWithTeammate.mockRejectedValue(new Error('already ended coaching'));
    const { result } = renderHook(() => useClientCoaches('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(act(async () => { await result.current.share('u2'); })).rejects.toThrow('already ended coaching');
  });
});
