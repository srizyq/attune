import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ tables: {}, errors: {}, profile: null, trainers: [] }));
vi.mock('./supabase', () => {
  const builder = (table) => {
    const q = { eq: () => q, order: () => q, range: () => Promise.resolve(h.errors[table] ? { data: null, error: h.errors[table] } : { data: h.tables[table] ?? [], error: null }) };
    return q;
  };
  return { supabase: { from: (table) => ({ select: () => builder(table) }) } };
});
vi.mock('./db', () => ({ getProfile: async () => { if (h.profileError) throw h.profileError; return h.profile; }, getMyTrainers: async () => h.trainers }));

import { exportMyData, exportFilename, EXPORT_FORMAT } from './dataExport';
import { EXPORT_TABLES } from './dataExportTables';

beforeEach(() => { h.tables = {}; h.errors = {}; h.profile = { id: 'u1', name: 'Sam' }; h.profileError = null; h.trainers = []; vi.spyOn(console, 'error').mockImplementation(() => {}); });

describe('exportMyData', () => {
  it('includes the profile, every table, and says what it left out on purpose', async () => {
    h.tables.food_logs = [{ id: 1, food_name: 'Oats' }];
    h.tables.trainer_comments = [{ id: 2, body: 'hi', sender_role: 'client' }, { id: 3, body: 'hello', sender_role: 'trainer' }];
    const r = await exportMyData('u1', { now: new Date('2026-10-16T01:00:00Z') });
    expect(r).toMatchObject({ format: EXPORT_FORMAT, exportedAt: '2026-10-16T01:00:00.000Z', profile: { name: 'Sam' } });
    expect(r.foodLogs).toEqual([{ id: 1, food_name: 'Oats' }]);
    expect(r.coachMessages).toHaveLength(2); // both directions of the conversation
    expect(r.skipped).toEqual([]);
    expect(r.included).toEqual(expect.arrayContaining(['Profile and targets', 'Food log', 'Messages with your coach', 'Friends', 'Your coaches (names and consent)']));
    expect(r.included).toHaveLength(EXPORT_TABLES.length + 3);
    expect(r.notIncluded.join(' ')).toMatch(/private notes a coach keeps/i);
    for (const def of EXPORT_TABLES) expect(r, def.key).toHaveProperty(def.key);
  });

  it('puts a section it cannot read in `skipped` with a reason, and still exports everything else', async () => {
    h.tables.weight_logs = [{ id: 9 }];
    h.errors.workout_logs = { code: '42501', message: 'permission denied for table workout_logs' };
    h.errors.fasts = { code: '42P01', message: 'relation "fasts" does not exist' };
    const r = await exportMyData('u1');
    expect(r.weightLogs).toEqual([{ id: 9 }]);
    expect(r).not.toHaveProperty('workouts');
    expect(r.skipped).toEqual([
      { section: 'Workouts', reason: 'permission denied for table workout_logs' },
      { section: 'Fasts', reason: 'not available on this account yet' },
    ]);
    expect(r.included).not.toContain('Workouts');
  });

  it('reports a profile that cannot be read instead of failing the whole export', async () => {
    h.profileError = new Error('network down');
    const r = await exportMyData('u1');
    expect(r.skipped[0]).toEqual({ section: 'Profile and targets', reason: 'network down' });
    expect(r.foodLogs).toEqual([]);
  });

  it('lists coaches by name and consent, not as raw rows', async () => {
    h.trainers = [{ status: 'active', created_at: '2026-09-01T00:00:00Z', consented_at: '2026-09-01T00:05:00Z', trainer: { id: 't', name: 'Jordan Lee' } }];
    expect((await exportMyData('u1')).coaches).toEqual([{ status: 'active', connectedAt: '2026-09-01T00:00:00Z', consentedAt: '2026-09-01T00:05:00Z', coach: 'Jordan Lee' }]);
  });

  it('both sides of a friendship are included', async () => {
    h.tables.friendships = [{ user_a: 'u1', user_b: 'f1' }];
    expect((await exportMyData('u1')).friendships).toHaveLength(2); // one query per side, each returns the fixture
  });

  it('names the file by date', () => {
    expect(exportFilename(new Date('2026-10-16T23:00:00Z'))).toBe('attune-data-export-2026-10-16.json');
  });
});
