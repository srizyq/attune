import { describe, it, expect, vi } from 'vitest';
import { saveLastImport, loadLastImport, clearLastImport, undoImport, UNDO_WINDOW_DAYS } from './undo';

const batch = (over = {}) => ({ from: '2026-10-05T04:00:00.000Z', to: '2026-10-05T04:00:30.000Z', weightDates: ['2026-03-01', '2026-03-02'], foodAdded: 12, weightAdded: 2, ...over });
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m }; };
const NOW = new Date('2026-10-06T00:00:00Z');

describe('remembering the last import', () => {
  it('round-trips a batch, stamped with when it happened', () => {
    const storage = memory();
    expect(saveLastImport('u1', batch(), { storage, now: NOW })).toBe(true);
    expect(loadLastImport('u1', { storage, now: NOW })).toEqual({ ...batch(), at: NOW.toISOString() });
  });
  it('keeps each account separate', () => {
    const storage = memory();
    saveLastImport('u1', batch(), { storage, now: NOW });
    expect(loadLastImport('u2', { storage, now: NOW })).toBeNull();
  });
  it('replaces the previous import with the newest one', () => {
    const storage = memory();
    saveLastImport('u1', batch({ foodAdded: 1 }), { storage, now: NOW });
    saveLastImport('u1', batch({ foodAdded: 99 }), { storage, now: NOW });
    expect(loadLastImport('u1', { storage, now: NOW }).foodAdded).toBe(99);
  });
  it('forgets it once cleared', () => {
    const storage = memory();
    saveLastImport('u1', batch(), { storage, now: NOW });
    clearLastImport('u1', { storage });
    expect(loadLastImport('u1', { storage, now: NOW })).toBeNull();
  });
  it('expires after a month', () => {
    const storage = memory();
    saveLastImport('u1', batch(), { storage, now: NOW });
    const day = 86400000;
    expect(loadLastImport('u1', { storage, now: new Date(NOW.getTime() + (UNDO_WINDOW_DAYS - 1) * day) })).not.toBeNull();
    expect(loadLastImport('u1', { storage, now: new Date(NOW.getTime() + (UNDO_WINDOW_DAYS + 1) * day) })).toBeNull();
  });
  it('does not save a missing batch or user', () => {
    const storage = memory();
    expect(saveLastImport('u1', null, { storage })).toBe(false);
    expect(saveLastImport(null, batch(), { storage })).toBe(false);
    expect(storage._m.size).toBe(0);
  });
  it('ignores corrupt or tampered data rather than crashing', () => {
    const storage = memory();
    for (const bad of ['not json', '{"from":1}', JSON.stringify({ ...batch(), at: 'x' }), JSON.stringify({ ...batch(), weightDates: 'nope' }), JSON.stringify({ ...batch(), from: 'garbage' }), 'null']) {
      storage.setItem('attune-last-import:u1', bad);
      expect(loadLastImport('u1', { storage, now: NOW })).toBeNull();
    }
  });
  it('copes with storage that throws or is missing', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
    expect(saveLastImport('u1', batch(), { storage: throwing })).toBe(false);
    expect(loadLastImport('u1', { storage: throwing })).toBeNull();
    expect(() => clearLastImport('u1', { storage: throwing })).not.toThrow();
  });
});

describe('undoImport', () => {
  const fakeDb = (over = {}) => ({ deleteImportedFood: vi.fn().mockResolvedValue(12), deleteImportedWeights: vi.fn().mockResolvedValue(2), ...over });

  it('removes the food and weights inside the batch window and reports the counts', async () => {
    const db = fakeDb();
    const r = await undoImport({ userId: 'u1', batch: batch(), db });
    expect(r).toEqual({ foodRemoved: 12, weightRemoved: 2, error: null });
    expect(db.deleteImportedFood).toHaveBeenCalledWith('u1', '2026-10-05T04:00:00.000Z', '2026-10-05T04:00:30.000Z');
    expect(db.deleteImportedWeights).toHaveBeenCalledWith('u1', ['2026-03-01', '2026-03-02'], '2026-10-05T04:00:00.000Z', '2026-10-05T04:00:30.000Z');
  });
  it('leaves weights alone when the import added none, and food alone when it added none', async () => {
    const db = fakeDb();
    await undoImport({ userId: 'u1', batch: batch({ weightAdded: 0, weightDates: [] }), db });
    expect(db.deleteImportedWeights).not.toHaveBeenCalled();
    const db2 = fakeDb();
    await undoImport({ userId: 'u1', batch: batch({ foodAdded: 0 }), db: db2 });
    expect(db2.deleteImportedFood).not.toHaveBeenCalled();
    expect(db2.deleteImportedWeights).toHaveBeenCalled();
  });
  it('stops at a failure and says how far it got', async () => {
    const db = fakeDb({ deleteImportedWeights: vi.fn().mockRejectedValue(new Error('network down')) });
    expect(await undoImport({ userId: 'u1', batch: batch(), db })).toEqual({ foodRemoved: 12, weightRemoved: 0, error: 'network down' });
    const db2 = fakeDb({ deleteImportedFood: vi.fn().mockRejectedValue(new Error('rls')) });
    const r = await undoImport({ userId: 'u1', batch: batch(), db: db2 });
    expect(r.error).toBe('rls');
    expect(db2.deleteImportedWeights).not.toHaveBeenCalled();
  });
});
