import { describe, it, expect, vi } from 'vitest';
import { chunkByDay, planImport, runImport, toFoodLogRow, toWeightLogRow, CHUNK_ROWS } from './run';
import { parseImportFiles } from './diary';
import { provenanceOf, PROVENANCE } from '../provenance';

const entry = (loggedDate, name = 'Food', over = {}) => ({ loggedDate, meal: 'lunch', name, cal: 100, protein: 5, carbs: 10, fat: 2, fibre: 1, sugar: 2, sodium: 50, saturatedFat: 0.5, cholesterol: 3, potassium: 40, calcium: 20, iron: 0.4, ...over });
const parsedOf = (entries, weights = []) => ({
  entries, weights, days: [...new Set(entries.map((e) => e.loggedDate))].sort(),
  firstDate: entries[0]?.loggedDate ?? null, lastDate: entries.at(-1)?.loggedDate ?? null,
});
const fakeDb = (over = {}) => ({
  insertFoodLogRows: vi.fn().mockResolvedValue(undefined),
  insertWeightLogRows: vi.fn().mockImplementation(async (rows) => rows.length),
  ...over,
});

describe('toFoodLogRow', () => {
  it('maps an entry to a food_logs row marked as imported, 1 serving, no clock time', () => {
    expect(toFoodLogRow('u1', entry('2026-03-05', 'Oats'))).toMatchObject({
      user_id: 'u1', logged_date: '2026-03-05', meal: 'lunch', food_name: 'Oats', calories: 100, protein_g: 5, carbs_g: 10, fat_g: 2,
      fibre_g: 1, sugar_g: 2, sodium_mg: 50, saturated_fat_g: 0.5, logged_amount: 1, logged_unit: 'serving', logged_at: null, source: 'import',
    });
  });
  it('only uses columns that the food_logs table has', () => {
    const cols = Object.keys(toFoodLogRow('u', entry('2026-03-05')));
    const schemaCols = ['user_id', 'logged_date', 'meal', 'food_name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sodium_mg', 'sugar_g', 'saturated_fat_g', 'cholesterol_mg', 'potassium_mg', 'calcium_mg', 'iron_mg', 'logged_at', 'source', 'logged_amount', 'logged_unit'];
    for (const c of cols) expect(schemaCols, c).toContain(c);
  });
  it('maps a weigh-in', () => {
    expect(toWeightLogRow('u1', { date: '2026-03-05', weight: 80.5, unit: 'kg' })).toEqual({ user_id: 'u1', logged_date: '2026-03-05', weight: 80.5, unit: 'kg' });
  });
  it('is tagged so it shows as imported in provenance', () => {
    expect(provenanceOf('import')).toBe('imported');
    expect(PROVENANCE.imported.short).toBe('Imported');
  });
});

describe('chunkByDay', () => {
  it('never splits a day across chunks', () => {
    const entries = [...Array(5).fill(0).map((_, i) => entry('2026-03-01', `a${i}`)), ...Array(5).fill(0).map((_, i) => entry('2026-03-02', `b${i}`)), entry('2026-03-03')];
    const chunks = chunkByDay(entries, 7);
    expect(chunks.map((c) => c.rows.length)).toEqual([5, 6]);
    expect(chunks.map((c) => c.days)).toEqual([1, 2]);
    for (const c of chunks) expect(new Set(c.rows.map((r) => r.loggedDate)).size).toBe(c.days);
  });
  it('gives an oversize day a chunk of its own', () => {
    const big = Array.from({ length: 10 }, (_, i) => entry('2026-03-01', `x${i}`));
    expect(chunkByDay([...big, entry('2026-03-02')], 4).map((c) => c.rows.length)).toEqual([10, 1]);
  });
  it('packs many small days into few chunks, in date order', () => {
    const entries = Array.from({ length: 1000 }, (_, i) => entry(`2026-${String(1 + Math.floor(i / 100)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`));
    const chunks = chunkByDay(entries);
    expect(chunks.reduce((s, c) => s + c.rows.length, 0)).toBe(1000);
    for (const c of chunks) expect(c.rows.length).toBeLessThanOrEqual(CHUNK_ROWS + 40);
    const dates = chunks.flatMap((c) => c.rows.map((r) => r.loggedDate));
    expect(dates).toEqual([...dates].sort());
  });
  it('is empty for nothing', () => {
    expect(chunkByDay([])).toEqual([]);
  });
});

describe('planImport', () => {
  const parsed = parsedOf([entry('2026-03-01'), entry('2026-03-01'), entry('2026-03-02'), entry('2026-03-03')]);
  it('leaves out days that already have food, when asked to', () => {
    const plan = planImport(parsed, new Set(['2026-03-01']), true);
    expect(plan).toMatchObject({ days: 2, skippedDays: 1, skippedEntries: 2 });
    expect(plan.entries.every((e) => e.loggedDate !== '2026-03-01')).toBe(true);
  });
  it('imports everything when not skipping, even on days that have food', () => {
    expect(planImport(parsed, new Set(['2026-03-01']), false)).toMatchObject({ days: 3, skippedDays: 0, skippedEntries: 0 });
  });
  it('accepts an array of dates, or nothing', () => {
    expect(planImport(parsed, ['2026-03-02'], true).skippedDays).toBe(1);
    expect(planImport(parsed, null, true).skippedDays).toBe(0);
  });
});

describe('runImport', () => {
  const parsed = parsedOf([entry('2026-03-01'), entry('2026-03-01'), entry('2026-03-02')], [{ date: '2026-03-01', weight: 80, unit: 'kg' }, { date: '2026-03-02', weight: 79.8, unit: 'kg' }]);

  it('writes food and weight and reports what it did', async () => {
    const db = fakeDb();
    const progress = vi.fn();
    const r = await runImport({ userId: 'u1', parsed, existingDays: new Set(), onProgress: progress, db });
    expect(r).toEqual({ foodImported: 3, daysImported: 2, skippedDays: 0, weightImported: 2, weightSkipped: 0, error: null });
    expect(db.insertFoodLogRows.mock.calls.flatMap((c) => c[0])).toHaveLength(3);
    expect(db.insertFoodLogRows.mock.calls[0][0].every((row) => row.user_id === 'u1' && row.source === 'import')).toBe(true);
    expect(db.insertWeightLogRows.mock.calls[0][0]).toEqual([
      { user_id: 'u1', logged_date: '2026-03-01', weight: 80, unit: 'kg' }, { user_id: 'u1', logged_date: '2026-03-02', weight: 79.8, unit: 'kg' },
    ]);
    expect(progress).toHaveBeenLastCalledWith({ done: 5, total: 5 });
  });

  it('skips days that already have food by default, so a second run adds nothing', async () => {
    const db = fakeDb();
    const first = await runImport({ userId: 'u1', parsed, existingDays: new Set(), db });
    expect(first.foodImported).toBe(3);
    const second = await runImport({ userId: 'u1', parsed, existingDays: new Set(parsed.days), db: fakeDb() });
    expect(second).toMatchObject({ foodImported: 0, daysImported: 0, skippedDays: 2 });
  });

  it('counts weigh-ins that were already there as skipped, not added', async () => {
    const db = fakeDb({ insertWeightLogRows: vi.fn().mockResolvedValue(1) });
    const r = await runImport({ userId: 'u1', parsed, existingDays: new Set(), db });
    expect(r).toMatchObject({ weightImported: 1, weightSkipped: 1 });
  });

  it('stops at the first failed chunk, reports it, and has not claimed the failed rows', async () => {
    const many = parsedOf(Array.from({ length: 700 }, (_, i) => entry(`2026-0${1 + (i % 3)}-${String(1 + Math.floor(i / 30) % 28).padStart(2, '0')}`, `f${i}`)));
    let calls = 0;
    const db = fakeDb({ insertFoodLogRows: vi.fn().mockImplementation(async () => { calls++; if (calls === 2) throw new Error('network down'); }) });
    const r = await runImport({ userId: 'u1', parsed: many, existingDays: new Set(), db });
    expect(r.error).toBe('network down');
    expect(db.insertFoodLogRows).toHaveBeenCalledTimes(2);
    expect(r.foodImported).toBeGreaterThan(0);
    expect(r.foodImported).toBeLessThan(700);
    expect(db.insertWeightLogRows).not.toHaveBeenCalled(); // weight waits for the food to finish
  });

  it('reports a weight failure after food succeeded', async () => {
    const db = fakeDb({ insertWeightLogRows: vi.fn().mockRejectedValue(new Error('rls')) });
    const r = await runImport({ userId: 'u1', parsed, existingDays: new Set(), db });
    expect(r).toMatchObject({ foodImported: 3, weightImported: 0, error: 'rls' });
  });

  it('does nothing, harmlessly, for an empty import', async () => {
    const db = fakeDb();
    const r = await runImport({ userId: 'u1', parsed: parsedOf([]), existingDays: new Set(), db });
    expect(r).toMatchObject({ foodImported: 0, error: null });
    expect(db.insertFoodLogRows).not.toHaveBeenCalled();
    expect(db.insertWeightLogRows).not.toHaveBeenCalled();
  });

  it('works end to end from a parsed file', async () => {
    const p = parseImportFiles([{ name: 'd.csv', text: 'Date,Meal,Food Name,Calories,Protein (g)\n2026-03-05,Lunch,Rice,200,4\n2026-03-05,Dinner,Fish,300,30' }], { today: '2026-10-05' });
    const db = fakeDb();
    const r = await runImport({ userId: 'u1', parsed: p, existingDays: new Set(), db });
    expect(r.foodImported).toBe(2);
    expect(db.insertFoodLogRows.mock.calls[0][0].map((x) => [x.meal, x.food_name, x.calories])).toEqual([['lunch', 'Rice', 200], ['dinner', 'Fish', 300]]);
  });
});
