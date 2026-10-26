// The judgement layer for a trainer's client list: from one row of
// get_client_summaries(), how well is this client adhering, and what (if
// anything) needs a coach's attention? Pure functions, unit-tested in
// clientInsights.test.js — the thresholds live here, in one place, so
// they're easy to tune and the tests document them.
import { daysBetween } from './dates';
import { tolerancePct, COMPLETE_DAY_MEALS } from './adherence';
import { defaultPace } from './calorieTargets';

export const INACTIVE_DAYS = 3;
const WEIGHT_MOVE_KG = 0.5; // over ~2 weeks; below this is noise, not a trend
const TARGETS_CHANGED_DAYS = 14; // how long "changed their own targets" stays flagged

// The days we can judge a client's targets on. get_client_summaries counts a
// past day with only breakfast logged (a miss), but leaves today out until it
// is complete; a database that hasn't had the update yet has no such column,
// so every logged day counts, as before.
const judgedDays = (s) => (s.days_judged_7d != null ? Number(s.days_judged_7d) || 0 : Number(s.days_logged_7d) || 0);

// 0–100, or null when there's nothing to judge yet. Logging consistency is
// half the score; hitting the calorie and protein targets on the days they
// did log make up the rest. Components that can't be measured (no target
// set) drop out and the remainder is re-weighted, so a client without a
// calorie target isn't capped below 100 for something they can't control.
export function adherenceScore(s) {
  if (!s) return null;
  const logged = Number(s.days_logged_7d) || 0;
  if (logged === 0 && s.last_log_date == null) return null;
  const parts = [{ weight: 0.5, value: Math.min(logged / 7, 1) }];
  const judged = judgedDays(s);
  if (s.calorie_target && judged > 0) parts.push({ weight: 0.3, value: (Number(s.days_on_target_7d) || 0) / judged });
  if (s.protein_g && judged > 0) parts.push({ weight: 0.2, value: (Number(s.days_protein_7d) || 0) / judged });
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = parts.reduce((sum, p) => sum + p.weight * p.value, 0) / total;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}

export function adherenceTone(score) {
  if (score == null) return 'none';
  if (score >= 70) return 'good';
  if (score >= 40) return 'fair';
  return 'low';
}

// Days since the client last logged food, or null if they never have.
export function daysSinceLastLog(s, today) {
  if (!s?.last_log_date) return null;
  const n = daysBetween(String(s.last_log_date).slice(0, 10), today);
  return Number.isFinite(n) ? Math.max(0, n) : null;
}

// ── weight against the plan ─────────────────────────────────────────────────
// The client's weight rate (median of pairwise slopes over 28 days — see
// get_client_summaries) set against the pace they and their coach chose. A
// client who is meant to lose 0.5 kg a week and is flat is not "on track", and
// the old flag only ever fired when weight moved the wrong way.
const WRONG_WAY_KG_WEEK = 0.15;
const STALLED_KG_WEEK = 0.1;
const SLOW_FRACTION = 0.5;
const FAST_FRACTION = 1.5;
const FAST_EXCESS_KG_WEEK = 0.2;
const DRIFT_KG_WEEK = 0.3;

// { status, rate, planned } or null when there's no rate to judge (fewer than 4
// weigh-ins over 10+ days, or the database update hasn't been applied).
// `rate` and `planned` are signed kg/week (negative = losing).
export function weightPlan(s) {
  if (!s || s.weight_rate_kg_week == null || !s.goal) return null;
  const rate = Number(s.weight_rate_kg_week);
  if (!Number.isFinite(rate)) return null;
  if (s.goal === 'maintain') {
    return { status: Math.abs(rate) >= DRIFT_KG_WEEK ? 'drifting' : 'steady', rate, planned: 0 };
  }
  const pace = Number(s.pace_kg_per_week) || defaultPace(s.goal) || 0;
  const planned = s.goal === 'lose' ? -pace : pace;
  const along = s.goal === 'lose' ? -rate : rate; // positive = moving the planned way
  let status = 'on-track';
  if (along <= -WRONG_WAY_KG_WEEK) status = 'wrong-way';
  else if (Math.abs(rate) < STALLED_KG_WEEK && along < SLOW_FRACTION * pace) status = 'stalled';
  else if (along < SLOW_FRACTION * pace) status = 'slow';
  else if (along > FAST_FRACTION * pace && along - pace >= FAST_EXCESS_KG_WEEK) status = 'fast';
  return { status, rate, planned };
}

const signedKg = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(Math.round(n * 100) / 100)}`;
export const describeWeightPlan = (plan) => (plan.planned === 0
  ? `${signedKg(plan.rate)} kg/week`
  : `${signedKg(plan.rate)} kg/week against a plan of ${signedKg(plan.planned)}`);

// Why this client might need a message from their coach today, most urgent
// first. `severity` 'high' = go and look now; 'medium' = worth a nudge.
export function attentionFlags(s, today) {
  if (!s) return [];
  const flags = [];
  const since = daysSinceLastLog(s, today);
  const connectedDays = daysBetween(String(s.connected_at).slice(0, 10), today);
  const logged = Number(s.days_logged_7d) || 0;

  if (since == null) {
    // Never logged: give a brand-new client a few days before calling it out.
    if (Number.isFinite(connectedDays) && connectedDays >= INACTIVE_DAYS) {
      flags.push({ id: 'never-logged', severity: 'high', label: 'Hasn’t logged anything yet' });
    }
  } else if (since >= INACTIVE_DAYS) {
    flags.push({ id: 'inactive', severity: 'high', label: `No logs in ${since} days` });
  } else if (logged <= 3) {
    flags.push({ id: 'low-logging', severity: 'medium', label: `Logged ${logged} of the last 7 days` });
  }

  const judged = judgedDays(s);
  if (judged >= 3 && s.calorie_target) {
    const rate = (Number(s.days_on_target_7d) || 0) / judged;
    if (rate < 0.4) flags.push({ id: 'off-target', severity: 'medium', label: 'Often off calorie target' });
  }

  // Days with food logged but not finished (fewer than 3 meal slots) say little
  // about whether targets are being hit — worth a nudge to log full days.
  if (s.days_complete_7d != null && logged >= 3) {
    const complete = Number(s.days_complete_7d) || 0;
    if (complete / logged < 0.5) flags.push({ id: 'partial-days', severity: 'medium', label: `Only ${complete} of ${logged} logged days were complete` });
  }

  const plan = weightPlan(s);
  if (plan) {
    if (plan.status === 'wrong-way') flags.push({ id: 'weight-wrong-way', severity: 'medium', label: `Weight moving the wrong way: ${describeWeightPlan(plan)}` });
    else if (plan.status === 'stalled') flags.push({ id: 'weight-stalled', severity: 'medium', label: `Weight not moving: ${describeWeightPlan(plan)}` });
    else if (plan.status === 'drifting') flags.push({ id: 'weight-drifting', severity: 'medium', label: `Weight drifting: ${describeWeightPlan(plan)}` });
  } else {
    // No rate to go on (too few weigh-ins, or no database update yet): fall back
    // to the plain two-week change, as before.
    const change = s.weight_change_kg_14d == null ? null : Number(s.weight_change_kg_14d);
    if (change != null) {
      if (s.goal === 'lose' && change >= WEIGHT_MOVE_KG) {
        flags.push({ id: 'weight-wrong-way', severity: 'medium', label: `Weight up ${change.toFixed(1)} kg in 2 weeks` });
      } else if (s.goal === 'build' && change <= -WEIGHT_MOVE_KG) {
        flags.push({ id: 'weight-wrong-way', severity: 'medium', label: `Weight down ${Math.abs(change).toFixed(1)} kg in 2 weeks` });
      }
    }
  }

  // A client taking their targets back from the coach: the coach should hear
  // about it (it also arrives as a message), and it clears when they set them again.
  if (s.targets_overridden_at && !s.targets_set_by) {
    const days = daysBetween(String(s.targets_overridden_at).slice(0, 10), today);
    if (Number.isFinite(days) && days >= 0 && days <= TARGETS_CHANGED_DAYS) {
      flags.push({ id: 'targets-changed', severity: 'medium', label: 'Changed their own targets' });
    }
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1));
}

export function needsAttention(s, today) {
  return attentionFlags(s, today).length > 0;
}

// Case-insensitive match on name or group label; an empty query matches all.
export function matchesSearch(s, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return true;
  return [s?.client_name, s?.group_label].some((v) => String(v ?? '').toLowerCase().includes(q));
}

export const SORTS = [
  { id: 'attention', label: 'Needs attention' },
  { id: 'name', label: 'Name' },
  { id: 'adherence', label: 'Lowest adherence' },
  { id: 'recent', label: 'Least recently active' },
];

// Returns a new sorted array; never mutates. Ties always fall back to name,
// so the order is stable and doesn't reshuffle between refreshes.
export function sortSummaries(list, sortId, today) {
  const byName = (a, b) => String(a.client_name ?? '').localeCompare(String(b.client_name ?? ''));
  const key = {
    // Severity first (high before medium before none), then lowest adherence.
    attention: (a, b) => {
      const rank = (s) => { const f = attentionFlags(s, today); return f.length === 0 ? 2 : f[0].severity === 'high' ? 0 : 1; };
      const d = rank(a) - rank(b);
      if (d !== 0) return d;
      return (adherenceScore(a) ?? -1) - (adherenceScore(b) ?? -1);
    },
    adherence: (a, b) => (adherenceScore(a) ?? -1) - (adherenceScore(b) ?? -1),
    // Longest quiet first; never-logged counts as the quietest of all.
    recent: (a, b) => (daysSinceLastLog(b, today) ?? Infinity) - (daysSinceLastLog(a, today) ?? Infinity),
    name: () => 0,
  }[sortId] || (() => 0);
  return [...list].sort((a, b) => key(a, b) || byName(a, b));
}

// One line for a client row: what they ate today, or how long they've been quiet.
export function activityLabel(s, today) {
  const since = daysSinceLastLog(s, today);
  if (since == null) return 'Never logged';
  if (since === 0) return `${Math.round(Number(s.today_cal) || 0).toLocaleString()} kcal today`;
  if (since === 1) return 'Last logged yesterday';
  return `Last logged ${since} days ago`;
}

// ── weekly summary ──────────────────────────────────────────────────────────

const shortDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const fromKgTo = (kg, unit) => (unit === 'lb' ? kg / 0.45359237 : kg);
const oneDp = (n) => (Math.round(n * 10) / 10).toString();

// A few plain-English lines a coach can read at a glance or paste into a
// message to the client — deterministic (no AI, so no invented claims) and
// built only from the numbers get_client_summaries already returns.
// Returns { lines, text }, or null when there's no summary to describe.
export function weeklySummary(s, { today, name, unit = 'kg' } = {}) {
  if (!s) return null;
  const lines = [];
  const logged = Number(s.days_logged_7d) || 0;
  const hasComplete = s.days_complete_7d != null;
  const complete = Number(s.days_complete_7d) || 0;

  // Prefer the average over complete days: a day with only breakfast logged drags
  // the plain average down and isn't a real day's intake.
  const avgSource = hasComplete && s.avg_cal_complete_7d != null ? s.avg_cal_complete_7d : s.avg_cal_7d;
  const avg = avgSource != null ? Math.round(Number(avgSource)) : null;
  const bits = [];
  if (hasComplete && logged > 0) bits.push(complete === logged ? 'all complete' : `${complete} complete`);
  if (avg != null && logged > 0) bits.push(`average ${avg.toLocaleString()} kcal${hasComplete && s.avg_cal_complete_7d != null ? ' on complete days' : ''}${s.calorie_target ? `, target ${Number(s.calorie_target).toLocaleString()}` : ''}`);
  let logging = `Logged food on ${logged} of the last 7 days`;
  if (bits.length) logging += ` (${bits.join('; ')})`;
  lines.push(logging);

  if (logged > 0 && (s.calorie_target || s.protein_g)) {
    const judged = judgedDays(s);
    const parts = [];
    // A database without the update still judges every logged day at ±15%.
    const tol = s.days_judged_7d != null ? tolerancePct() : 15;
    if (s.calorie_target) parts.push(`within ${tol}% of calorie target on ${Number(s.days_on_target_7d) || 0} of ${judged} ${s.days_judged_7d != null ? 'judged' : 'logged'} days`);
    if (s.protein_g) parts.push(`protein target (90%+) met on ${Number(s.days_protein_7d) || 0}`);
    lines.push(parts.join('; ').replace(/^./, (c) => c.toUpperCase()) + (s.days_judged_7d != null ? ` (a day is judged once ${COMPLETE_DAY_MEALS}+ meals are logged)` : ''));
  }

  if (s.latest_weight_kg != null) {
    const now = oneDp(fromKgTo(Number(s.latest_weight_kg), unit));
    const plan = weightPlan(s);
    if (plan) {
      const rate = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${oneDp(Math.abs(fromKgTo(n, unit)))}`;
      lines.push(`Weight trend ${rate(plan.rate)} ${unit}/week${plan.planned ? ` against a plan of ${rate(plan.planned)}` : ''} (now ${now} ${unit})`);
    } else if (s.weight_change_kg_14d != null) {
      const change = fromKgTo(Number(s.weight_change_kg_14d), unit);
      const sign = change > 0 ? '+' : change < 0 ? '-' : '';
      lines.push(`Weight ${sign}${oneDp(Math.abs(change))} ${unit} over the last 2 weeks (now ${now} ${unit})`);
    } else {
      lines.push(`Weight ${now} ${unit} (no earlier weigh-in in the last 2 weeks to compare)`);
    }
  }

  const since = daysSinceLastLog(s, today);
  lines.push(since == null ? 'Has never logged food' : since === 0 ? 'Last logged today' : since === 1 ? 'Last logged yesterday' : `Last logged ${since} days ago`);

  const first = String(name ?? '').trim().split(/\s+/)[0] || 'Client';
  const header = `${first} — the 7 days to ${today ? shortDate(today) : 'today'}`;
  return { header, lines, text: [header, ...lines.map((l) => `- ${l}`)].join('\n') };
}
