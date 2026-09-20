// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ rows: [], added: [] }));
vi.mock('./useAuth', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/db', () => ({
  getFoodLogsForDate: vi.fn(async () => h.rows),
  addFoodLog: vi.fn(async (_u, entry) => { h.added.push(entry); return { id: 'new', food_name: entry.name, meal: entry.meal }; }),
  deleteFoodLog: vi.fn(), updateFoodLog: vi.fn(),
}));
import { useFoodLogs, mapRow } from './useFoodLogs';

h.auth = { user: { id: 'u1' } };
beforeEach(() => { h.rows = []; h.added.length = 0; });

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
