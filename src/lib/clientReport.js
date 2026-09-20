// Builds a nutrition report for one client from raw rows — pure functions
// (no fetching, no DOM), so the numbers a coach hands to a client or attaches
// to a file are unit-tested. clientReportData.js does the fetching; the
// Reports tab wires the two to buttons.
import { MICRO_NUTRIENTS, MICRO_COLUMNS } from './microNutrients';
import { toKg, fromKg } from './adaptiveTDEE';
import { daysBetween } from './dates';
import { provenanceBreakdown, describeBreakdown } from './provenance';

export const MAX_REPORT_DAYS = 366;

export const DAY_FILTERS = [
  { id: 'all', label: 'All days', hint: 'Every day in the range; days with nothing logged count as zero' },
  { id: 'logged', label: 'Days with food logged', hint: 'Skips days with nothing logged' },
  { id: 'complete', label: 'Complete days only', hint: 'Only days with 3 or more meals logged' },
];

// A "complete" day: at least this many of the four meal slots have something
// in them. Cronometer lets the client mark a day complete; here it's inferred,
// so the definition is stated on every report.
export const COMPLETE_DAY_MEALS = 3;
const ON_TARGET_TOLERANCE = 0.1; // same ±10% the dashboard's "days on target" uses

// The food_logs column behind each micronutrient key — defined once, with the
// nutrient itself, in lib/microNutrients.js.
export { MICRO_COLUMNS };

// Decimal places to show a nutrient's daily figure with. The extended ones are
// small numbers (a day's B1 is about 1 mg) so they keep two.
export const microDecimals = (n) => (n.extended ? 2 : n.unit === 'g' || n.unit === 'mg' ? 1 : 0);

const num = (v) => Number(v) || 0;
const round = (n, dp = 0) => { const f = 10 ** dp; return Math.round(n * f) / f; };
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// null if fine, otherwise a sentence for the UI.
export function validateRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return 'Choose a start and end date.';
  const span = daysBetween(start, end);
  if (!Number.isFinite(span)) return 'Choose a start and end date.';
  if (span < 0) return 'The end date is before the start date.';
  if (span + 1 > MAX_REPORT_DAYS) return `Choose a range of ${MAX_REPORT_DAYS} days or fewer.`;
  return null;
}

// Every calendar date from start to end inclusive, as 'YYYY-MM-DD'.
export function datesInRange(start, end) {
  const out = [];
  const last = Date.parse(`${end}T00:00:00Z`);
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= last; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

const SLOTS = new Set(['breakfast', 'lunch', 'dinner', 'snacks']);

export function buildReport({ client, start, end, dayFilter = 'all', foodLogs = [], checkins = [], weightLogs = [], workouts = [], includeMicros = false }) {
  const problem = validateRange(start, end);
  if (problem) throw new RangeError(problem);

  const target = client.calorie_target ? num(client.calorie_target) : null;
  const byDate = new Map(datesInRange(start, end).map((date) => [date, {
    date, calories: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, items: 0, slots: new Set(),
    mood: null, energy: null, water: null, micros: {},
  }]));

  for (const log of foodLogs) {
    const day = byDate.get(log.logged_date);
    if (!day) continue; // outside the range (or a stray row)
    day.calories += num(log.calories);
    day.protein += num(log.protein_g);
    day.carbs += num(log.carbs_g);
    day.fat += num(log.fat_g);
    day.fibre += num(log.fibre_g);
    day.items += 1;
    day.slots.add(SLOTS.has(log.meal) ? log.meal : 'snacks');
    if (includeMicros) for (const [key, col] of Object.entries(MICRO_COLUMNS)) day.micros[key] = (day.micros[key] || 0) + num(log[col]);
  }
  for (const c of checkins) {
    const day = byDate.get(c.checkin_date);
    if (!day) continue;
    // One check-in per day in practice; if a stray duplicate ever appears, a
    // blank field must not erase a real value from another.
    if (c.mood != null) day.mood = c.mood;
    if (c.energy != null) day.energy = c.energy;
    if (c.water_glasses != null) day.water = c.water_glasses;
  }

  const days = [...byDate.values()].map((d) => ({
    date: d.date, calories: d.calories, protein: d.protein, carbs: d.carbs, fat: d.fat, fibre: d.fibre,
    items: d.items, meals: d.slots.size, logged: d.items > 0, complete: d.slots.size >= COMPLETE_DAY_MEALS,
    mood: d.mood, energy: d.energy, water: d.water, micros: d.micros,
  }));

  const keep = { all: () => true, logged: (d) => d.logged, complete: (d) => d.complete }[dayFilter] || (() => true);
  const included = days.filter(keep);
  const loggedIncluded = included.filter((d) => d.logged);

  const energyValues = included.filter((d) => d.energy != null).map((d) => num(d.energy));
  const sortedWeights = [...weightLogs].sort((a, b) => a.logged_date.localeCompare(b.logged_date));
  const unit = client.unit === 'imperial' ? 'lb' : 'kg';
  const inUnit = (w) => round(fromKg(toKg(num(w.weight), w.unit), unit), 1);
  let weight = null;
  if (sortedWeights.length > 0) {
    const first = inUnit(sortedWeights[0]);
    const last = inUnit(sortedWeights[sortedWeights.length - 1]);
    weight = { first, last, change: round(last - first, 1), unit, entries: sortedWeights.length };
  }

  // Where the included days' calories came from, so a reader can weigh how
  // exact the totals are (a report full of AI estimates is a rougher guide).
  const includedDates = new Set(included.map((d) => d.date));
  const sources = provenanceBreakdown(foodLogs.filter((l) => includedDates.has(l.logged_date)));

  const summary = {
    sources,
    rangeDays: days.length,
    includedDays: included.length,
    loggedDays: days.filter((d) => d.logged).length,
    completeDays: days.filter((d) => d.complete).length,
    avgCalories: round(mean(included.map((d) => d.calories)) ?? 0),
    avgProtein: round(mean(included.map((d) => d.protein)) ?? 0),
    avgCarbs: round(mean(included.map((d) => d.carbs)) ?? 0),
    avgFat: round(mean(included.map((d) => d.fat)) ?? 0),
    daysOnTarget: target ? loggedIncluded.filter((d) => Math.abs(d.calories - target) <= target * ON_TARGET_TOLERANCE).length : null,
    daysEvaluatedForTarget: target ? loggedIncluded.length : 0,
    avgEnergy: energyValues.length ? round(mean(energyValues), 1) : null,
    weight,
    workouts: {
      sessions: workouts.length,
      minutes: round(workouts.reduce((s, w) => s + num(w.duration_minutes), 0)),
      calories: round(workouts.reduce((s, w) => s + num(w.calories_burned), 0)),
    },
  };

  const micros = includeMicros && included.length > 0
    ? MICRO_NUTRIENTS.map((n) => ({
        key: n.key, label: n.label, unit: n.unit, extended: !!n.extended,
        avg: round(mean(included.map((d) => d.micros[n.key] || 0)), microDecimals(n)),
      }))
    : null;

  return {
    meta: { clientName: client.name || 'Client', start, end, dayFilter },
    targets: { goal: client.goal || null, calories: target, protein: client.protein_g ? num(client.protein_g) : null, carbs: client.carbs_g ? num(client.carbs_g) : null, fat: client.fat_g ? num(client.fat_g) : null },
    days, included, summary, micros,
  };
}

// ── output: CSV ─────────────────────────────────────────────────────────────

// Spreadsheet apps execute a text cell starting with = + - @ as a formula, so
// any *string* that starts that way gets a leading apostrophe. Numbers are
// written raw (a negative number is a number, not a formula).
export function csvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildCsv(report) {
  const micros = report.micros ? MICRO_NUTRIENTS : [];
  const header = ['Date', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Fibre (g)', 'Meals logged', 'Complete day', 'Mood', 'Energy', 'Water (glasses)', ...micros.map((n) => `${n.label} (${n.unit})`)];
  const rows = report.included.map((d) => [
    d.date, round(d.calories), round(d.protein, 1), round(d.carbs, 1), round(d.fat, 1), round(d.fibre, 1), d.meals, d.complete ? 'yes' : 'no',
    d.mood, d.energy, d.water, ...micros.map((n) => round(d.micros[n.key] || 0, microDecimals(n))),
  ]);
  // UTF-8 BOM so Excel reads accented names correctly; CRLF per RFC 4180.
  return '\ufeff' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function reportFilename(report, ext) {
  const slug = report.meta.clientName.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'client';
  return `attune-${slug}-${report.meta.start}-to-${report.meta.end}.${ext}`;
}

// ── output: printable HTML ──────────────────────────────────────────────────

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const GOAL_LABELS = { lose: 'Lose weight', maintain: 'Stay balanced', build: 'Build muscle' };
const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

// A standalone, light-themed document (that's what prints legibly and cheaply)
// meant to be opened in a new window and printed / saved as PDF. Every dynamic
// value goes through esc().
export function buildReportHtml(report, { generatedOn = new Date().toLocaleDateString('en-AU') } = {}) {
  const { meta, targets, summary, micros, included } = report;
  const kv = (label, value) => `<div class="row"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const filter = DAY_FILTERS.find((f) => f.id === meta.dayFilter) || DAY_FILTERS[0];
  const w = summary.weight;

  const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.clientName)} — Nutrition Report</title>
<style>
  body { font-family: -apple-system, 'Plus Jakarta Sans', Helvetica, Arial, sans-serif; color: #111; padding: 36px; max-width: 760px; margin: 0 auto; font-size: 13px; }
  h1 { font-family: Georgia, serif; font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #888; margin: 26px 0 8px; }
  .sub { color: #777; margin-bottom: 20px; }
  .row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e5e5; }
  .row span { color: #666; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { text-align: right; padding: 5px 8px; border-bottom: 1px solid #eee; }
  th:first-child, td:first-child { text-align: left; }
  th { color: #888; font-weight: 600; font-size: 11px; }
  .note { color: #777; font-size: 11px; line-height: 1.5; margin-top: 26px; }
  @media print { body { padding: 0; } tr { page-break-inside: avoid; } }
</style></head><body>
<h1>${esc(meta.clientName)} — Nutrition Report</h1>
<div class="sub">${esc(fmtDate(meta.start))} – ${esc(fmtDate(meta.end))} · ${esc(filter.label)} · generated ${esc(generatedOn)}</div>

<h2>Goal &amp; targets</h2>
${kv('Goal', GOAL_LABELS[targets.goal] || '—')}
${kv('Calorie target', targets.calories ? `${targets.calories.toLocaleString()} kcal` : '—')}
${kv('Protein', targets.protein ? `${targets.protein} g` : '—')}
${kv('Carbs', targets.carbs ? `${targets.carbs} g` : '—')}
${kv('Fat', targets.fat ? `${targets.fat} g` : '—')}

<h2>Summary (${esc(summary.includedDays)} of ${esc(summary.rangeDays)} days)</h2>
${kv('Days with food logged', `${summary.loggedDays} of ${summary.rangeDays}`)}
${kv('Complete days (3+ meals)', `${summary.completeDays} of ${summary.rangeDays}`)}
${kv('Average calories', `${summary.avgCalories.toLocaleString()} kcal`)}
${kv('Average protein / carbs / fat', `${summary.avgProtein} / ${summary.avgCarbs} / ${summary.avgFat} g`)}
${kv('Days within 10% of calorie target', summary.daysOnTarget == null ? '—' : `${summary.daysOnTarget} of ${summary.daysEvaluatedForTarget} logged days`)}
${kv('Data sources (by calories)', summary.sources.length ? describeBreakdown(summary.sources) : '—')}
${kv('Average energy (check-ins)', summary.avgEnergy == null ? '—' : `${summary.avgEnergy} / 10`)}
${w ? kv('Weight', `${w.first} → ${w.last} ${w.unit} (${w.change > 0 ? '+' : ''}${w.change} ${w.unit})`) : kv('Weight', 'No entries')}
${kv('Workouts', summary.workouts.sessions ? `${summary.workouts.sessions} sessions · ${summary.workouts.minutes} min · ${summary.workouts.calories.toLocaleString()} kcal` : 'None logged')}

${micros ? `<h2>Average daily micronutrients</h2>${table(['Nutrient', 'Average'], micros.map((n) => [n.extended ? `${n.label} †` : n.label, `${n.avg} ${n.unit}`]))}` : ''}

<h2>Daily detail</h2>
${included.length === 0 ? '<p>No days match this filter.</p>' : table(['Date', 'kcal', 'Protein', 'Carbs', 'Fat', 'Meals', 'Energy'], included.map((d) => [d.date, round(d.calories), round(d.protein, 1), round(d.carbs, 1), round(d.fat, 1), d.meals, d.energy ?? '—']))}

<p class="note">Figures come from what the client logged in Attune. Foods without micronutrient data in their source count as zero, so micronutrient averages can understate intake${micros && micros.some((n) => n.extended) ? '; nutrients marked † are only carried by some food databases, so treat them as a minimum' : ''}; a "complete day" is inferred as one with 3 or more of the 4 meals logged. Generated by Attune.</p>
</body></html>`;
}
