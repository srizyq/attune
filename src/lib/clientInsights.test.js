import { describe, it, expect } from 'vitest';
import {
  adherenceScore, adherenceTone, daysSinceLastLog, attentionFlags, needsAttention,
  matchesSearch, sortSummaries, activityLabel, INACTIVE_DAYS,
} from './clientInsights.js';

const TODAY = '2026-09-20';
const row = (over = {}) => ({
  client_id: 'c', client_name: 'Sam', group_label: null, connected_at: '2026-08-01T00:00:00Z', goal: 'maintain',
  calorie_target: 2000, protein_g: 150, last_log_date: '2026-09-20', days_logged_7d: 7, days_on_target_7d: 7,
  days_protein_7d: 7, today_cal: 1900, weight_change_kg_14d: null, ...over,
});

describe('adherenceScore', () => {
  it('is 100 for a client who logs daily and hits every target', () => {
    expect(adherenceScore(row())).toBe(100);
  });
  it('weights logging consistency at half and targets at the rest', () => {
    // logs 7/7 (0.5), never on target (0), never protein (0)
    expect(adherenceScore(row({ days_on_target_7d: 0, days_protein_7d: 0 }))).toBe(50);
    // logs 3/7 days, all on target and protein: 0.5*(3/7) + 0.3 + 0.2
    expect(adherenceScore(row({ days_logged_7d: 3, days_on_target_7d: 3, days_protein_7d: 3 }))).toBe(71);
  });
  it('re-weights when a target is not set instead of capping the score', () => {
    expect(adherenceScore(row({ calorie_target: null, protein_g: null }))).toBe(100);
    expect(adherenceScore(row({ calorie_target: null, days_protein_7d: 0 }))).toBe(Math.round((0.5 * 1 + 0.2 * 0) / 0.7 * 100));
  });
  it('is null when there is nothing to judge, 0 when they logged once long ago', () => {
    expect(adherenceScore(null)).toBeNull();
    expect(adherenceScore(row({ last_log_date: null, days_logged_7d: 0 }))).toBeNull();
    expect(adherenceScore(row({ last_log_date: '2026-08-01', days_logged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0 }))).toBe(0);
  });
  it('never leaves 0–100 even with inconsistent inputs', () => {
    const s = adherenceScore(row({ days_logged_7d: 9, days_on_target_7d: 20, days_protein_7d: 20 }));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
});

describe('adherenceTone', () => {
  it('buckets scores', () => {
    expect([100, 70, 69, 40, 39, 0].map(adherenceTone)).toEqual(['good', 'good', 'fair', 'fair', 'low', 'low']);
    expect(adherenceTone(null)).toBe('none');
  });
});

describe('attentionFlags', () => {
  const ids = (s) => attentionFlags(s, TODAY).map(f => f.id);

  it('has nothing to say about a client who is doing well', () => {
    expect(ids(row())).toEqual([]);
    expect(needsAttention(row(), TODAY)).toBe(false);
  });
  it('flags a quiet client as high severity, with how long', () => {
    const [f] = attentionFlags(row({ last_log_date: '2026-09-15' }), TODAY);
    expect(f).toEqual({ id: 'inactive', severity: 'high', label: 'No logs in 5 days' });
  });
  it('uses the shared inactivity threshold exactly', () => {
    expect(ids(row({ last_log_date: '2026-09-18', days_logged_7d: 5 }))).toEqual([]); // 2 days
    expect(ids(row({ last_log_date: '2026-09-17', days_logged_7d: 5 }))).toContain('inactive'); // 3 days
    expect(INACTIVE_DAYS).toBe(3);
  });
  it('flags patchy logging without also calling them inactive', () => {
    expect(ids(row({ days_logged_7d: 2, days_on_target_7d: 2, days_protein_7d: 2 }))).toEqual(['low-logging']);
  });
  it('gives a brand-new client grace, but not forever', () => {
    expect(ids(row({ last_log_date: null, days_logged_7d: 0, connected_at: '2026-09-19T00:00:00Z' }))).toEqual([]);
    expect(ids(row({ last_log_date: null, days_logged_7d: 0, connected_at: '2026-09-10T00:00:00Z' }))).toEqual(['never-logged']);
  });
  it('flags being often off calorie target only with enough data and a target', () => {
    expect(ids(row({ days_logged_7d: 5, days_on_target_7d: 1 }))).toEqual(['off-target']);
    expect(ids(row({ days_logged_7d: 2, days_on_target_7d: 0 }))).toEqual(['low-logging']); // too little data to judge targets
    expect(ids(row({ days_logged_7d: 5, days_on_target_7d: 1, calorie_target: null }))).toEqual([]);
  });
  it('flags weight moving against the goal, and only against the goal', () => {
    expect(ids(row({ goal: 'lose', weight_change_kg_14d: 0.8 }))).toEqual(['weight-wrong-way']);
    expect(attentionFlags(row({ goal: 'lose', weight_change_kg_14d: 0.8 }), TODAY)[0].label).toBe('Weight up 0.8 kg in 2 weeks');
    expect(ids(row({ goal: 'lose', weight_change_kg_14d: -1.2 }))).toEqual([]);
    expect(ids(row({ goal: 'lose', weight_change_kg_14d: 0.3 }))).toEqual([]); // noise
    expect(ids(row({ goal: 'build', weight_change_kg_14d: -0.9 }))).toEqual(['weight-wrong-way']);
    expect(ids(row({ goal: 'maintain', weight_change_kg_14d: 2 }))).toEqual([]);
    expect(ids(row({ goal: 'lose', weight_change_kg_14d: null }))).toEqual([]);
  });
  it('orders high severity before medium', () => {
    const flags = attentionFlags(row({ goal: 'lose', weight_change_kg_14d: 1, last_log_date: '2026-09-10', days_logged_7d: 0 }), TODAY);
    expect(flags.map(f => f.severity)).toEqual(['high', 'medium']);
  });
  it('copes with a missing row', () => {
    expect(attentionFlags(null, TODAY)).toEqual([]);
  });
});

describe('daysSinceLastLog / activityLabel', () => {
  it('reads the client\'s last log relative to the trainer\'s today', () => {
    expect(daysSinceLastLog(row({ last_log_date: '2026-09-17' }), TODAY)).toBe(3);
    expect(daysSinceLastLog(row({ last_log_date: null }), TODAY)).toBeNull();
    expect(daysSinceLastLog(row({ last_log_date: '2026-09-25' }), TODAY)).toBe(0); // future-dated (timezone skew) clamps to today
  });
  it('words it for a list row', () => {
    expect(activityLabel(row({ today_cal: 1234.4 }), TODAY)).toBe('1,234 kcal today');
    expect(activityLabel(row({ last_log_date: '2026-09-19' }), TODAY)).toBe('Last logged yesterday');
    expect(activityLabel(row({ last_log_date: '2026-09-15' }), TODAY)).toBe('Last logged 5 days ago');
    expect(activityLabel(row({ last_log_date: null }), TODAY)).toBe('Never logged');
  });
});

describe('matchesSearch', () => {
  it('matches name or group, ignoring case and surrounding space', () => {
    expect(matchesSearch(row({ client_name: 'Sam Client', group_label: 'Cut' }), '  sam ')).toBe(true);
    expect(matchesSearch(row({ client_name: 'Sam Client', group_label: 'Cut' }), 'cut')).toBe(true);
    expect(matchesSearch(row({ client_name: 'Sam Client' }), 'zzz')).toBe(false);
    expect(matchesSearch(row({ client_name: null, group_label: null }), 'a')).toBe(false);
  });
  it('an empty search matches everyone', () => {
    expect(matchesSearch(row(), '')).toBe(true);
    expect(matchesSearch(row(), undefined)).toBe(true);
  });
});

describe('sortSummaries', () => {
  const ok = row({ client_id: 'ok', client_name: 'Ok' });
  const quiet = row({ client_id: 'quiet', client_name: 'Quiet', last_log_date: '2026-09-10', days_logged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0 });
  const patchy = row({ client_id: 'patchy', client_name: 'Patchy', days_logged_7d: 2, days_on_target_7d: 2, days_protein_7d: 2 });
  const never = row({ client_id: 'never', client_name: 'Never', last_log_date: null, days_logged_7d: 0, connected_at: '2026-09-01T00:00:00Z' });
  const order = (sortId, list = [ok, patchy, quiet, never]) => sortSummaries(list, sortId, TODAY).map(s => s.client_id);

  it('puts the most urgent first by default, then by lowest adherence', () => {
    // high: quiet (adherence 0), never (null -> -1 first); medium: patchy; fine: ok
    expect(order('attention')).toEqual(['never', 'quiet', 'patchy', 'ok']);
  });
  it('sorts by name, adherence and recency', () => {
    expect(order('name')).toEqual(['never', 'ok', 'patchy', 'quiet']);
    expect(order('adherence')).toEqual(['never', 'quiet', 'patchy', 'ok']);
    expect(order('recent')).toEqual(['never', 'quiet', 'ok', 'patchy']);
  });
  it('falls back to name so equal rows keep a stable order', () => {
    const a = row({ client_id: 'a', client_name: 'Amy' });
    const b = row({ client_id: 'b', client_name: 'Bob' });
    expect(order('attention', [b, a])).toEqual(['a', 'b']);
    expect(order('bogus', [b, a])).toEqual(['a', 'b']);
  });
  it('does not mutate its input', () => {
    const input = [ok, quiet];
    sortSummaries(input, 'attention', TODAY);
    expect(input).toEqual([ok, quiet]);
  });
});
