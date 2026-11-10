// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ rows: [], added: [], toasts: [] }));
vi.mock('../lib/appToast', () => ({ showAppToast: (m, isError) => h.toasts.push({ m, isError }) }));
vi.mock('./useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/db', () => ({
  getFoodLogsForDate: vi.fn(async () => h.rows),
  getDaySlots: vi.fn(async () => []),
  addFoodLog: vi.fn(async (_u, entry) => { h.added.push(entry); return { id: 'new', food_name: entry.name, meal: entry.meal }; }),
  deleteFoodLog: vi.fn(), updateFoodLog: vi.fn(),
}));
import { useFoodLogs, mapRow, clearFoodLogCache } from './useFoodLogs';
import { addFoodLog, deleteFoodLog, updateFoodLog } from '../lib/db';

h.auth = { user: { id: 'u1' } };
beforeEach(() => { h.rows = []; h.added.length = 0; h.toasts.length = 0; clearFoodLogCache(); vi.clearAllMocks(); });

describe('mapRow', () => {
  it('keeps unknown extended nutrients null and measured zeros as 0', () => {
    const item = mapRow({ id: '1', food_name: 'Coffee', meal: 'snacks', calories: 5, caffeine_mg: 95, thiamin_mg: 0, selenium_mcg: null });
    expect(item.caffeine).toBe(95);
    expect(item.thiamin).toBe(0);
    expect(item.selenium).toBeNull();
    expect(item.iodine).toBeNull(); // column not in the row at all
  });

  it('still maps the older nutrients with their old zero-default behaviour', () => {
    const item = mapRow({ id: '1', food_name: 'Toast', meal: 'lunch', calories: 100 });
    expect(item.calcium).toBe(0);
    expect(item.zinc).toBe(0);
  });
});

describe('useFoodLogs.addFood', () => {
  it('passes the extended nutrients on, and null for the ones a food does not carry', async () => {
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.addFood({ name: 'Salmon', cal: 200, thiamin: 0.25 }, 'lunch', null); });
    expect(h.added).toHaveLength(1);
    expect(h.added[0]).toMatchObject({ name: 'Salmon', thiamin: 0.25, selenium: null, caffeine: null });
  });
});

const row = (over = {}) => ({ id: 'r1', food_name: 'Toast', meal: 'lunch', calories: 100, logged_date: '2026-09-21', ...over });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

describe('useFoodLogs: instant changes', () => {
  it('shows a logged food at once, before the server answers, then swaps in the saved row', async () => {
    const save = deferred();
    addFoodLog.mockImplementationOnce(() => save.promise);
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.addFood({ name: 'Salmon', cal: 200 }, 'dinner', null); });
    expect(result.current.meals.dinner.map((i) => i.name)).toEqual(['Salmon']);
    expect(result.current.meals.dinner[0].id).toMatch(/^tmp-/);
    await act(async () => { save.resolve({ id: 'real-1', food_name: 'Salmon', meal: 'dinner', calories: 200 }); await save.promise; });
    expect(result.current.meals.dinner.map((i) => i.id)).toEqual(['real-1']);
  });

  it('takes a food back out and says so when the server refuses it', async () => {
    addFoodLog.mockRejectedValueOnce(new Error('violates check constraint'));
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.addFood({ name: 'Salmon', cal: 200 }, 'dinner', null); });
    await waitFor(() => expect(result.current.meals.dinner).toHaveLength(0));
    expect(h.toasts).toHaveLength(1);
    expect(h.toasts[0]).toMatchObject({ isError: true });
    expect(h.toasts[0].m).toContain('Salmon');
  });

  it('removes a deleted food at once and puts it back if the delete fails', async () => {
    h.rows = [row()];
    deleteFoodLog.mockRejectedValueOnce(new Error('rls'));
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.meals.lunch).toHaveLength(1));
    await act(async () => { await result.current.deleteFood('r1'); });
    await waitFor(() => expect(result.current.meals.lunch).toHaveLength(1)); // restored after the failure
    expect(h.toasts[0]).toMatchObject({ isError: true });
  });

  it('keeps a deleted food gone when the delete works', async () => {
    h.rows = [row()];
    deleteFoodLog.mockResolvedValueOnce();
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.meals.lunch).toHaveLength(1));
    await act(async () => { await result.current.deleteFood('r1'); });
    expect(result.current.meals.lunch).toHaveLength(0);
    expect(deleteFoodLog).toHaveBeenCalledWith('r1');
    expect(h.toasts).toHaveLength(0);
  });

  it('shows an edit at once and undoes it if saving fails', async () => {
    h.rows = [row()];
    updateFoodLog.mockRejectedValueOnce(new Error('violates check constraint'));
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.meals.lunch).toHaveLength(1));
    await act(async () => { await result.current.updateFood('r1', { cal: 250 }); });
    await waitFor(() => expect(h.toasts).toHaveLength(1));
    expect(result.current.meals.lunch[0].cal).toBe(100); // back to what it was
  });

  it('deleting a food that is still saving removes the saved row once it exists', async () => {
    const save = deferred();
    addFoodLog.mockImplementationOnce(() => save.promise);
    deleteFoodLog.mockResolvedValue();
    const { result } = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.addFood({ name: 'Salmon', cal: 200 }, 'dinner', null); });
    const tempId = result.current.meals.dinner[0].id;
    await act(async () => { await result.current.deleteFood(tempId); });
    expect(result.current.meals.dinner).toHaveLength(0);
    await act(async () => { save.resolve({ id: 'real-1', food_name: 'Salmon', meal: 'dinner' }); await save.promise; });
    expect(deleteFoodLog).toHaveBeenCalledWith('real-1');
    expect(result.current.meals.dinner).toHaveLength(0);
  });
});

describe('useFoodLogs: shared days', () => {
  it('lets a second screen show the day instantly, with no loading state', async () => {
    h.rows = [row()];
    const first = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(first.result.current.meals.lunch).toHaveLength(1));
    const second = renderHook(() => useFoodLogs('2026-09-21'));
    expect(second.result.current.loading).toBe(false);
    expect(second.result.current.meals.lunch).toHaveLength(1);
  });

  it('shows a food logged on one screen on the other without a refresh', async () => {
    addFoodLog.mockResolvedValueOnce({ id: 'real-1', food_name: 'Salmon', meal: 'dinner' });
    const a = renderHook(() => useFoodLogs('2026-09-21'));
    const b = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    await act(async () => { await a.result.current.addFood({ name: 'Salmon', cal: 200 }, 'dinner', null); });
    expect(b.result.current.meals.dinner.map((i) => i.name)).toEqual(['Salmon']);
  });

  it('keeps days apart', async () => {
    h.rows = [row()];
    const a = renderHook(() => useFoodLogs('2026-09-21'));
    await waitFor(() => expect(a.result.current.meals.lunch).toHaveLength(1));
    h.rows = [];
    const b = renderHook(() => useFoodLogs('2026-09-22'));
    await waitFor(() => expect(b.result.current.loading).toBe(false));
    expect(b.result.current.meals.lunch).toHaveLength(0);
  });
});
