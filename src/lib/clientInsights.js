// The judgement layer for a trainer's client list: from one row of
// get_client_summaries(), how well is this client adhering, and what (if
// anything) needs a coach's attention? Pure functions, unit-tested in
// clientInsights.test.js — the thresholds live here, in one place, so
// they're easy to tune and the tests document them.
import { daysBetween } from './dates';

export const INACTIVE_DAYS = 3;
const WEIGHT_MOVE_KG = 0.5; // over ~2 weeks; below this is noise, not a trend

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
  if (s.calorie_target && logged > 0) parts.push({ weight: 0.3, value: (Number(s.days_on_target_7d) || 0) / logged });
  if (s.protein_g && logged > 0) parts.push({ weight: 0.2, value: (Number(s.days_protein_7d) || 0) / logged });
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

  if (logged >= 3 && s.calorie_target) {
    const rate = (Number(s.days_on_target_7d) || 0) / logged;
    if (rate < 0.4) flags.push({ id: 'off-target', severity: 'medium', label: 'Often off calorie target' });
  }

  const change = s.weight_change_kg_14d == null ? null : Number(s.weight_change_kg_14d);
  if (change != null) {
    if (s.goal === 'lose' && change >= WEIGHT_MOVE_KG) {
      flags.push({ id: 'weight-wrong-way', severity: 'medium', label: `Weight up ${change.toFixed(1)} kg in 2 weeks` });
    } else if (s.goal === 'build' && change <= -WEIGHT_MOVE_KG) {
      flags.push({ id: 'weight-wrong-way', severity: 'medium', label: `Weight down ${Math.abs(change).toFixed(1)} kg in 2 weeks` });
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
