import { describe, it, expect } from 'vitest';
import {
  adherenceScore, adherenceTone, daysSinceLastLog, attentionFlags, needsAttention,
  matchesSearch, sortSummaries, activityLabel, weeklySummary, INACTIVE_DAYS, weightPlan, describeWeightPlan,
} from './clientInsights.js';

const TODAY = '2026-09-20';
// en-AU month abbreviations differ between ICU versions ("Sept"/"Sep"); format the way the code does.
const SHORT = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
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

describe('weeklySummary', () => {
  const full = row({ avg_cal_7d: 1950.4, latest_weight_kg: 81.44, weight_change_kg_14d: -0.62, days_on_target_7d: 5, days_protein_7d: 4, days_logged_7d: 6 });
  const w = (s, o = {}) => weeklySummary(s, { today: TODAY, name: 'Sam Client', ...o });

  it('reads as a handful of plain lines, with a copy-ready text block', () => {
    const r = w(full);
    expect(r.header).toBe(`Sam \u2014 the 7 days to ${SHORT(TODAY)}`);
    expect(r.lines).toEqual([
      'Logged food on 6 of the last 7 days (average 1,950 kcal, target 2,000)',
      'Within 15% of calorie target on 5 of 6 logged days; protein target (90%+) met on 4',
      'Weight \u22120.6 kg over the last 2 weeks (now 81.4 kg)',
      'Last logged today',
    ]);
    expect(r.text).toBe(`${r.header}\n${r.lines.map(l => '\u2022 ' + l).join('\n')}`);
  });
  it('is null without a summary', () => {
    expect(weeklySummary(null, { today: TODAY })).toBeNull();
  });
  it('converts weight to the client\'s own unit', () => {
    expect(w(full, { unit: 'lb' }).lines[2]).toBe('Weight \u22121.4 lb over the last 2 weeks (now 179.5 lb)');
  });
  it('says so when there is no earlier weigh-in to compare, and omits weight entirely when there is none', () => {
    expect(w(row({ latest_weight_kg: 80, weight_change_kg_14d: null })).lines.some(l => l.includes('no earlier weigh-in'))).toBe(true);
    expect(w(row({ latest_weight_kg: null })).lines.some(l => l.startsWith('Weight'))).toBe(false);
  });
  it('shows a gain with a plus sign', () => {
    expect(w(row({ latest_weight_kg: 82, weight_change_kg_14d: 0.7 })).lines.find(l => l.startsWith('Weight'))).toContain('+0.7 kg');
  });
  it('leaves out target lines for a client with no targets, and average when nothing was logged', () => {
    const r = w(row({ calorie_target: null, protein_g: null, days_logged_7d: 0, avg_cal_7d: null, last_log_date: '2026-09-10' }));
    expect(r.lines).toEqual(['Logged food on 0 of the last 7 days', 'Last logged 10 days ago']);
  });
  it('handles a client who has never logged, and missing name/date', () => {
    const r = weeklySummary(row({ last_log_date: null, days_logged_7d: 0, avg_cal_7d: null, calorie_target: null, protein_g: null }), {});
    expect(r.lines.at(-1)).toBe('Has never logged food');
    expect(r.header).toBe('Client \u2014 the 7 days to today');
  });
  it('words yesterday and days-ago', () => {
    expect(w(row({ last_log_date: '2026-09-19' })).lines.at(-1)).toBe('Last logged yesterday');
    expect(w(row({ last_log_date: '2026-09-16' })).lines.at(-1)).toBe('Last logged 4 days ago');
  });
});


// ── the shared "on target" definition, weight against the plan, and ownership ──
describe('adherenceScore with the shared definition', () => {
  it('judges targets against the days that could be judged, not every day logged', () => {
    // 7 logged, but today is unfinished so only 6 are judged: 5 on target of 6
    const base = row({ days_logged_7d: 7, days_judged_7d: 6, days_on_target_7d: 5, days_protein_7d: 6 });
    expect(adherenceScore(base)).toBe(Math.round((0.5 + 0.3 * (5 / 6) + 0.2) * 100));
  });
  it('counts an unfinished past day as a miss against targets (it is in the denominator)', () => {
    const finished = row({ days_logged_7d: 4, days_judged_7d: 4, days_on_target_7d: 4, days_protein_7d: 4 });
    const unfinished = row({ days_logged_7d: 4, days_judged_7d: 4, days_on_target_7d: 2, days_protein_7d: 2 });
    expect(adherenceScore(finished)).toBeGreaterThan(adherenceScore(unfinished));
  });
  it('falls back to logged days when the database has no days_judged_7d yet', () => {
    expect(adherenceScore(row({ days_logged_7d: 4, days_on_target_7d: 2, days_protein_7d: 2 }))).toBe(Math.round((0.5 * (4 / 7) + 0.3 * 0.5 + 0.2 * 0.5) * 100));
  });
  it('with nothing judgeable yet (only today, unfinished) the score is logging alone', () => {
    expect(adherenceScore(row({ days_logged_7d: 1, days_judged_7d: 0, days_on_target_7d: 0, days_protein_7d: 0 }))).toBe(Math.round((1 / 7) * 100));
  });
});

describe('weightPlan — actual rate against the planned pace', () => {
  const plan = (o) => weightPlan(row({ goal: 'lose', pace_kg_per_week: 0.5, ...o }));
  it('is on track when the rate is near the plan', () => {
    expect(plan({ weight_rate_kg_week: -0.45 })).toMatchObject({ status: 'on-track', planned: -0.5 });
  });
  it('calls a flat weight stalled — the case the old two-week flag never caught', () => {
    expect(plan({ weight_rate_kg_week: -0.04 }).status).toBe('stalled');
    expect(plan({ weight_rate_kg_week: 0.05 }).status).toBe('stalled');
  });
  it('calls a real but slow loss slow, and a clearly wrong-way move wrong-way', () => {
    expect(plan({ weight_rate_kg_week: -0.2 }).status).toBe('slow');
    expect(plan({ weight_rate_kg_week: 0.3 }).status).toBe('wrong-way');
  });
  it('calls a much faster loss fast, but not a marginally faster one', () => {
    expect(plan({ weight_rate_kg_week: -0.9 }).status).toBe('fast');
    expect(plan({ weight_rate_kg_week: -0.6 }).status).toBe('on-track');
  });
  it('mirrors for building', () => {
    const b = (r) => weightPlan(row({ goal: 'build', pace_kg_per_week: 0.25, weight_rate_kg_week: r }));
    expect(b(0.25).status).toBe('on-track');
    expect(b(0.02).status).toBe('stalled');
    expect(b(-0.2).status).toBe('wrong-way');
    expect(b(0.1).status).toBe('slow');
  });
  it('uses the default pace when none was chosen', () => {
    expect(weightPlan(row({ goal: 'lose', pace_kg_per_week: null, weight_rate_kg_week: -0.05 }))).toMatchObject({ status: 'stalled', planned: -0.35 });
  });
  it('maintenance only cares about drift', () => {
    expect(weightPlan(row({ goal: 'maintain', weight_rate_kg_week: 0.1 })).status).toBe('steady');
    expect(weightPlan(row({ goal: 'maintain', weight_rate_kg_week: -0.4 })).status).toBe('drifting');
  });
  it('is null with no rate or no goal', () => {
    expect(weightPlan(row({ weight_rate_kg_week: null }))).toBeNull();
    expect(weightPlan(row({ goal: null, weight_rate_kg_week: -0.4 }))).toBeNull();
    expect(weightPlan(null)).toBeNull();
  });
  it('describes the rate against the plan in plain words', () => {
    expect(describeWeightPlan({ rate: -0.04, planned: -0.5 })).toBe('−0.04 kg/week against a plan of −0.5');
    expect(describeWeightPlan({ rate: 0.3, planned: 0.25 })).toBe('+0.3 kg/week against a plan of +0.25');
  });
});

describe('attentionFlags — new flags', () => {
  const ids = (s) => attentionFlags(s, TODAY).map(f => f.id);
  const lose = (o) => row({ goal: 'lose', pace_kg_per_week: 0.5, ...o });

  it('flags weight that is not moving, with the plan in the label', () => {
    const [f] = attentionFlags(lose({ weight_rate_kg_week: -0.03 }), TODAY);
    expect(f).toEqual({ id: 'weight-stalled', severity: 'medium', label: 'Weight not moving: −0.03 kg/week against a plan of −0.5' });
  });
  it('flags a wrong-way move from the rate, and a maintenance client who is drifting', () => {
    expect(ids(lose({ weight_rate_kg_week: 0.3 }))).toEqual(['weight-wrong-way']);
    expect(ids(row({ goal: 'maintain', weight_rate_kg_week: -0.5 }))).toEqual(['weight-drifting']);
  });
  it('stays quiet when the rate is on plan, and for a slow-but-moving loss', () => {
    expect(ids(lose({ weight_rate_kg_week: -0.45 }))).toEqual([]);
    expect(ids(lose({ weight_rate_kg_week: -0.25 }))).toEqual([]);
  });
  it('falls back to the plain two-week change when there is no rate', () => {
    expect(ids(lose({ weight_rate_kg_week: null, weight_change_kg_14d: 0.8 }))).toEqual(['weight-wrong-way']);
    expect(ids(lose({ weight_rate_kg_week: null, weight_change_kg_14d: -0.8 }))).toEqual([]);
  });
  it('flags a client who often leaves days unfinished', () => {
    const flags = attentionFlags(row({ days_logged_7d: 6, days_complete_7d: 2, days_judged_7d: 6, days_on_target_7d: 2, days_protein_7d: 2 }), TODAY);
    expect(flags).toContainEqual({ id: 'partial-days', severity: 'medium', label: 'Only 2 of 6 logged days were complete' });
    expect(ids(row({ days_logged_7d: 6, days_complete_7d: 5, days_judged_7d: 6 }))).toEqual([]);
    expect(ids(row({ days_logged_7d: 6 }))).toEqual([]); // no column yet → no claim
  });
  it('judges "often off target" on judged days', () => {
    // 2 of 5 judged = 40%: not under the 0.4 line. 1 of 5 is.
    expect(ids(row({ days_logged_7d: 7, days_judged_7d: 5, days_on_target_7d: 2 }))).toEqual([]);
    expect(ids(row({ days_logged_7d: 7, days_judged_7d: 5, days_on_target_7d: 1 }))).toEqual(['off-target']);
  });
  it('tells the coach a client took their targets back — for two weeks, until the coach sets them again', () => {
    const s = row({ targets_overridden_at: '2026-09-18T03:00:00Z', targets_set_by: null });
    expect(attentionFlags(s, TODAY)).toEqual([{ id: 'targets-changed', severity: 'medium', label: 'Changed their own targets' }]);
    expect(ids(row({ targets_overridden_at: '2026-09-18T03:00:00Z', targets_set_by: 'coach-1' }))).toEqual([]); // coach re-set them
    expect(ids(row({ targets_overridden_at: '2026-08-01T03:00:00Z', targets_set_by: null }))).toEqual([]);    // long ago
  });
});

describe('weeklySummary with the shared definition', () => {
  const full2 = row({
    days_logged_7d: 6, days_complete_7d: 4, days_judged_7d: 6, days_on_target_7d: 3, days_protein_7d: 3,
    avg_cal_7d: 1700, avg_cal_complete_7d: 2050, latest_weight_kg: 81.4, weight_change_kg_14d: -0.6,
    goal: 'lose', pace_kg_per_week: 0.5, weight_rate_kg_week: -0.3,
  });
  it('says how many days were complete, averages over them, and judges at 10%', () => {
    const lines = weeklySummary(full2, { today: TODAY, name: 'Sam Client' }).lines;
    expect(lines[0]).toBe('Logged food on 6 of the last 7 days (4 complete; average 2,050 kcal on complete days, target 2,000)');
    expect(lines[1]).toBe('Within 10% of calorie target on 3 of 6 judged days; protein target (90%+) met on 3 (a day is judged once 3+ meals are logged)');
  });
  it('shows the weight trend against the plan when there is a rate', () => {
    expect(weeklySummary(full2, { today: TODAY }).lines[2]).toBe('Weight trend −0.3 kg/week against a plan of −0.5 (now 81.4 kg)');
    expect(weeklySummary(full2, { today: TODAY, unit: 'lb' }).lines[2]).toBe('Weight trend −0.7 lb/week against a plan of −1.1 (now 179.5 lb)');
  });
});
