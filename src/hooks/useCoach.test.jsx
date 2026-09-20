// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getClientSummaries: vi.fn(), getTrainerNotes: vi.fn(), addTrainerNote: vi.fn(), updateTrainerNote: vi.fn(), deleteTrainerNote: vi.fn(),
  getWorkoutLogsForRange: vi.fn(), getMyInvites: vi.fn(), getPendingClients: vi.fn(), createCoachInvite: vi.fn(), revokeCoachInvite: vi.fn(),
  getMyClients: vi.fn(), getMyTrainers: vi.fn(), redeemCoachInviteCode: vi.fn(), revokeClientLink: vi.fn(), respondToCoachLink: vi.fn(),
  setClientGroup: vi.fn(), getTrainerComments: vi.fn(), addTrainerComment: vi.fn(), deleteTrainerComment: vi.fn(),
  getLatestCoachComment: vi.fn(), getGeneralThread: vi.fn(), addClientReply: vi.fn(), getFoodLogsForDate: vi.fn(),
}));
vi.mock('../lib/db', () => db);
vi.mock('./useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

import { useClientSummaries, useTrainerNotes, useClientWorkouts, useCoachInvites } from './useCoach';

beforeEach(() => { Object.values(db).forEach(fn => fn.mockReset()); });

// These states — the feature's SQL not deployed yet — are exactly what
// production is in between a code push and running the migration, so each
// hook has to hand its consumers a usable value, never null.
describe('useClientSummaries', () => {
  it('returns real rows when the function exists', async () => {
    db.getClientSummaries.mockResolvedValue([{ link_id: 'l1' }]);
    const { result } = renderHook(() => useClientSummaries('2026-09-20'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ summaries: [{ link_id: 'l1' }], supported: true });
    expect(db.getClientSummaries).toHaveBeenCalledWith('2026-09-20');
  });

  it('returns an empty ARRAY (not null) and supported=false when the function is not deployed', async () => {
    db.getClientSummaries.mockResolvedValue(null);
    const { result } = renderHook(() => useClientSummaries('2026-09-20'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Array.isArray(result.current.summaries)).toBe(true);
    expect(result.current.summaries).toEqual([]);
    expect(result.current.supported).toBe(false);
    expect(() => result.current.summaries.filter(Boolean).map(Boolean)).not.toThrow();
  });

  it('is an empty array while still loading', () => {
    db.getClientSummaries.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useClientSummaries('2026-09-20'));
    expect(result.current.summaries).toEqual([]);
    expect(result.current.loading).toBe(true);
  });

  it('degrades to the fallback list on an unexpected error, and never throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getClientSummaries.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useClientSummaries('2026-09-20'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.summaries).toEqual([]);
    expect(result.current.supported).toBe(false);
  });
});

describe('useTrainerNotes', () => {
  it('reports supported=false with an empty array when the table does not exist', async () => {
    db.getTrainerNotes.mockResolvedValue(null);
    const { result } = renderHook(() => useTrainerNotes('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supported).toBe(false);
    expect(result.current.notes).toEqual([]);
  });

  it('adds, updates and removes through the db layer and refetches', async () => {
    db.getTrainerNotes.mockResolvedValue([]);
    db.addTrainerNote.mockResolvedValue({});
    db.updateTrainerNote.mockResolvedValue();
    db.deleteTrainerNote.mockResolvedValue();
    const { result } = renderHook(() => useTrainerNotes('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.add('hello');
    expect(db.addTrainerNote).toHaveBeenCalledWith('u1', 'c1', 'hello', null);
    await result.current.update('n1', { pinned: true });
    expect(db.updateTrainerNote).toHaveBeenCalledWith('n1', { pinned: true });
    await result.current.remove('n1');
    expect(db.deleteTrainerNote).toHaveBeenCalledWith('n1');
    expect(db.getTrainerNotes.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('useClientWorkouts', () => {
  it('maps rows, newest first, and survives a failure with an empty list', async () => {
    db.getWorkoutLogsForRange.mockResolvedValue([
      { id: 'a', logged_date: '2026-09-18', type: 'running', intensity: 'moderate', duration_minutes: '30', calories_burned: '300' },
      { id: 'b', logged_date: '2026-09-20', type: 'yoga', intensity: 'light', duration_minutes: 45, calories_burned: 120 },
    ]);
    const { result } = renderHook(() => useClientWorkouts('c1', '2026-06-22', '2026-09-20'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workouts.map(w => w.id)).toEqual(['b', 'a']);
    expect(result.current.workouts[1]).toMatchObject({ durationMinutes: 30, caloriesBurned: 300 });

    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getWorkoutLogsForRange.mockRejectedValue(new Error('x'));
    const failing = renderHook(() => useClientWorkouts('c2', '2026-06-22', '2026-09-20'));
    await waitFor(() => expect(failing.result.current.loading).toBe(false));
    expect(failing.result.current.workouts).toEqual([]);
  });
});

describe('useCoachInvites', () => {
  it('reports supported=false with empty arrays when the invites table does not exist', async () => {
    db.getMyInvites.mockResolvedValue(null);
    db.getPendingClients.mockResolvedValue([]);
    const { result } = renderHook(() => useCoachInvites());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supported).toBe(false);
    expect(result.current.invites).toEqual([]);
    expect(result.current.pending).toEqual([]);
  });
});
