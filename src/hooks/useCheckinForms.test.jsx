// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const db = vi.hoisted(() => ({
  getCheckinForm: vi.fn(), saveCheckinForm: vi.fn(), deleteCheckinForm: vi.fn(),
  getCheckinResponses: vi.fn(), getMyCheckinForms: vi.fn(), submitCheckinResponse: vi.fn(),
}));
vi.mock('../lib/db', () => db);
// A stable object, like the real context provides — a fresh one each render would change every
// hook's `refetch` identity each render and cause spurious refetches.
const auth = vi.hoisted(() => ({ user: { id: 'coach' } }));
vi.mock('./useAuth', () => ({ useAuth: () => auth }));
import { useCheckinFormAdmin, useMyCheckinForms } from './useCheckinForms';

beforeEach(() => { Object.values(db).forEach(fn => fn.mockReset()); });

// The tables not existing yet is what production looks like between a code
// push and running the database update, so every hook must return usable
// arrays/flags then — never null.
describe('useCheckinFormAdmin', () => {
  it('loads the form and responses', async () => {
    db.getCheckinForm.mockResolvedValue({ supported: true, form: { id: 'f1' } });
    db.getCheckinResponses.mockResolvedValue({ supported: true, rows: [{ id: 'r1' }] });
    const { result } = renderHook(() => useCheckinFormAdmin('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ supported: true, form: { id: 'f1' }, responses: [{ id: 'r1' }] });
    expect(db.getCheckinForm).toHaveBeenCalledWith('coach', 'c1');
  });

  it('reports supported=false with safe empty values when the tables do not exist', async () => {
    db.getCheckinForm.mockResolvedValue({ supported: false, form: null });
    db.getCheckinResponses.mockResolvedValue({ supported: false, rows: [] });
    const { result } = renderHook(() => useCheckinFormAdmin('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.supported).toBe(false);
    expect(result.current.form).toBeNull();
    expect(Array.isArray(result.current.responses)).toBe(true);
    expect(() => result.current.responses.map(Boolean)).not.toThrow();
  });

  it('saves and removes through the db layer, then reloads', async () => {
    db.getCheckinForm.mockResolvedValue({ supported: true, form: null });
    db.getCheckinResponses.mockResolvedValue({ supported: true, rows: [] });
    db.saveCheckinForm.mockResolvedValue({ id: 'f1' });
    db.deleteCheckinForm.mockResolvedValue();
    const { result } = renderHook(() => useCheckinFormAdmin('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.save({ title: 'T', questions: [], cadenceDays: 7, isActive: true });
    expect(db.saveCheckinForm).toHaveBeenCalledWith('coach', 'c1', { title: 'T', questions: [], cadenceDays: 7, isActive: true });
    await result.current.remove('f1');
    expect(db.deleteCheckinForm).toHaveBeenCalledWith('f1');
    expect(db.getCheckinForm.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('survives a load failure without throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getCheckinForm.mockRejectedValue(new Error('network'));
    db.getCheckinResponses.mockResolvedValue({ supported: true, rows: [] });
    const { result } = renderHook(() => useCheckinFormAdmin('c1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.responses).toEqual([]);
  });
});

describe('useMyCheckinForms', () => {
  it('returns the forms', async () => {
    db.getMyCheckinForms.mockResolvedValue({ supported: true, forms: [{ id: 'f1' }] });
    const { result } = renderHook(() => useMyCheckinForms());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.forms).toEqual([{ id: 'f1' }]);
  });

  it('is an empty array and supported=false before the tables exist', async () => {
    db.getMyCheckinForms.mockResolvedValue({ supported: false, forms: [] });
    const { result } = renderHook(() => useMyCheckinForms());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ supported: false, forms: [] });
  });

  it('submits then reloads, so a due form flips to "next due"', async () => {
    db.getMyCheckinForms.mockResolvedValue({ supported: true, forms: [] });
    db.submitCheckinResponse.mockResolvedValue();
    const { result } = renderHook(() => useMyCheckinForms());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await result.current.submit('f1', { a: 1 });
    expect(db.submitCheckinResponse).toHaveBeenCalledWith('f1', { a: 1 });
    expect(db.getMyCheckinForms).toHaveBeenCalledTimes(2);
  });

  it('a failed submit rejects to the caller, so the form can show why', async () => {
    db.getMyCheckinForms.mockResolvedValue({ supported: true, forms: [] });
    db.submitCheckinResponse.mockRejectedValue(new Error('Some answers are missing or invalid'));
    const { result } = renderHook(() => useMyCheckinForms());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await expect(result.current.submit('f1', {})).rejects.toThrow('missing or invalid');
  });
});
