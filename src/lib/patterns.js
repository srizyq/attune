// Deterministic pattern/correlation engine — no network calls, no LLM.
// Turns a user's own food_logs + checkins into real, honest insights about
// how their eating relates to their mood and energy.

const MOOD_SCORE = { great: 5, good: 4, okay: 3, low: 2, tired: 1 };
const MIN_SAMPLE = 5; // minimum days per bucket before we'll claim a pattern

export function todayLocalDate(d = new Date()) {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function dateNDaysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() - n);
  return todayLocalDate(d);
}

// Every calendar date from startDate to endDate inclusive, as
// YYYY-MM-DD strings — used to fill gaps for charts so a day with no
// data still gets a labelled point instead of being skipped.
function dateRange(startDate, endDate) {
  const dates = [];
  let cursor = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  while (cursor <= end) {
    dates.push(todayLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// ── join food_logs + checkins into one row per calendar day ────────────────
function emptyDay(date) {
  return {
    date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, sugar_g: 0,
    proteinBeforeNoon_g: 0, mood: null, energy: null, loggedMeals: 0,
    waterGlasses: null, breakfastLogged: false,
  };
}

export function joinDailyData(foodLogs, checkins) {
  const byDate = new Map();

  for (const log of foodLogs) {
    const date = log.logged_date;
    if (!byDate.has(date)) byDate.set(date, emptyDay(date));
    const row = byDate.get(date);
    row.calories += Number(log.calories) || 0;
    row.protein_g += Number(log.protein_g) || 0;
    row.carbs_g += Number(log.carbs_g) || 0;
    row.fat_g += Number(log.fat_g) || 0;
    row.fibre_g += Number(log.fibre_g) || 0;
    row.sugar_g += Number(log.sugar_g) || 0;
    row.loggedMeals += 1;
    if (log.meal === 'breakfast') row.breakfastLogged = true;
    const hour = log.created_at ? new Date(log.created_at).getHours() : null;
    if (hour !== null && hour < 12) row.proteinBeforeNoon_g += Number(log.protein_g) || 0;
  }

  for (const c of checkins) {
    const date = c.checkin_date;
    if (!byDate.has(date)) byDate.set(date, emptyDay(date));
    const row = byDate.get(date);
    row.mood = c.mood;
    row.energy = c.energy;
    row.moodScore = MOOD_SCORE[c.mood] ?? null;
    row.waterGlasses = c.water_glasses ?? null;
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// ── stats helpers ───────────────────────────────────────────────────────────
function avg(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null;
}

export function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = avg(xs), my = avg(ys);
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? null : num / denom;
}

// Compare a metric between days matching a predicate vs days that don't.
export function segmentComparison(dailyData, predicate, metricKey, minSample = MIN_SAMPLE) {
  const withRows = dailyData.filter(d => d[metricKey] != null && predicate(d));
  const withoutRows = dailyData.filter(d => d[metricKey] != null && !predicate(d));
  if (withRows.length < minSample || withoutRows.length < minSample) return null;
  const withAvg = avg(withRows.map(d => d[metricKey]));
  const withoutAvg = avg(withoutRows.map(d => d[metricKey]));
  return {
    withAvg, withoutAvg, delta: withAvg - withoutAvg,
    withCount: withRows.length, withoutCount: withoutRows.length,
  };
}

function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 0 || day === 6;
}

// ── streaks ──────────────────────────────────────────────────────────────
// Consecutive days (counting back from today) where `predicate(day)` holds.
export function streakFor(dailyData, predicate) {
  const passDates = new Set(dailyData.filter(predicate).map(d => d.date));
  let streak = 0;
  let cursor = new Date();
  while (passDates.has(todayLocalDate(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function computeStreak(dailyData) {
  return streakFor(dailyData, d => d.loggedMeals > 0 || d.mood != null);
}

// ── insight generation ──────────────────────────────────────────────────────
// Every candidate declares `scale` — the metric's own range (energy is
// 1-10, moodScore is 1-5) — so effect sizes across different metrics can
// be compared on the same 0-1 footing when ranking (see generateInsights).
const CANDIDATES = [
  {
    metricKey: 'energy', scale: 10,
    predicate: d => d.proteinBeforeNoon_g >= 30,
    icon: '⚡', title: 'Protein timing', accentColor: '#6e8b74',
    body: (c) =>
      `You average ${c.withAvg.toFixed(1)}/10 energy on days you log 30g+ protein before noon, vs ${c.withoutAvg.toFixed(1)}/10 otherwise — a ${Math.abs(c.delta).toFixed(1)}-point ${c.delta >= 0 ? 'lift' : 'drop'} across ${c.withCount + c.withoutCount} logged days.`,
  },
  {
    metricKey: 'moodScore', scale: 5,
    predicate: d => isWeekend(d.date),
    icon: '📅', title: 'Weekday vs weekend', accentColor: '#6aabcf',
    body: (c) =>
      `Your mood runs ${c.delta >= 0 ? 'higher' : 'lower'} on weekends (${c.withAvg.toFixed(1)}/5) than weekdays (${c.withoutAvg.toFixed(1)}/5) — worth noticing if weekday routines are the lever you can actually pull.`,
  },
  {
    metricKey: 'energy', scale: 10,
    predicate: d => d.carbs_g > 0 && d.protein_g > 0 && d.carbs_g / Math.max(d.protein_g, 1) > 2.5,
    icon: '🍚', title: 'Carb-heavy days', accentColor: '#8c7b6b',
    body: (c) =>
      `On carb-heavy days (carbs more than 2.5x your protein), energy averages ${c.withAvg.toFixed(1)}/10 vs ${c.withoutAvg.toFixed(1)}/10 on more balanced days.`,
  },
  {
    metricKey: 'moodScore', scale: 5,
    predicate: d => d.calories > 0 && d.calories < 1200,
    icon: '🍽️', title: 'Under-fuelling', accentColor: '#c07070',
    body: (c) =>
      `Days you log under 1,200 kcal average ${c.withAvg.toFixed(1)}/5 mood vs ${c.withoutAvg.toFixed(1)}/5 on fuller days — under-eating may be costing you more than the calorie deficit is worth.`,
  },
  {
    metricKey: 'energy', scale: 10,
    predicate: d => d.fibre_g >= 25,
    icon: '🌾', title: 'Fibre intake', accentColor: '#7fae5f',
    body: (c) =>
      `On days you log 25g+ fibre, energy averages ${c.withAvg.toFixed(1)}/10 vs ${c.withoutAvg.toFixed(1)}/10 on lower-fibre days — across ${c.withCount + c.withoutCount} logged days.`,
  },
  {
    metricKey: 'energy', scale: 10,
    predicate: d => d.waterGlasses != null && d.waterGlasses >= 6,
    icon: '💧', title: 'Hydration', accentColor: '#6aabcf',
    body: (c) =>
      `Days you log 6+ glasses of water average ${c.withAvg.toFixed(1)}/10 energy vs ${c.withoutAvg.toFixed(1)}/10 on lower-hydration days.`,
  },
  {
    metricKey: 'moodScore', scale: 5,
    predicate: d => d.sugar_g >= 50,
    icon: '🍬', title: 'Sugar intake', accentColor: '#d98fb0',
    body: (c) =>
      `On days you log 50g+ sugar, mood averages ${c.withAvg.toFixed(1)}/5 vs ${c.withoutAvg.toFixed(1)}/5 on lower-sugar days.`,
  },
  {
    metricKey: 'energy', scale: 10,
    predicate: d => d.breakfastLogged === true,
    icon: '🌅', title: 'Breakfast', accentColor: '#e8c468',
    body: (c) =>
      `Days you log breakfast average ${c.withAvg.toFixed(1)}/10 energy vs ${c.withoutAvg.toFixed(1)}/10 on days you skip it.`,
  },
];

// A continuous dose-response pattern (protein vs energy across every
// logged day, not just a binary split) using pearsonCorrelation — kept
// deliberately conservative: needs 10+ days with both values present and
// |r| >= 0.3, so a handful of noisy days can't manufacture a "trend".
function proteinEnergyCorrelation(dailyData) {
  const rows = dailyData.filter(d => d.protein_g > 0 && d.energy != null);
  if (rows.length < 10) return null;
  const r = pearsonCorrelation(rows.map(d => d.protein_g), rows.map(d => d.energy));
  if (r == null || Math.abs(r) < 0.3) return null;
  return {
    icon: '🔗', title: 'Protein & energy', accentColor: '#9f97e8',
    effectSize: Math.abs(r),
    body: `Across ${rows.length} logged days, more protein tends to track with ${r >= 0 ? 'higher' : 'lower'} energy (r = ${r.toFixed(2)}) — not a guarantee, but a real trend in your own data.`,
  };
}

// Ranks every qualifying candidate by effect size (each segment
// comparison's delta normalized to its own metric's scale, so an energy
// pattern and a mood pattern are ranked on the same 0-1 footing) instead
// of returning whichever candidates happen to be declared first — the
// strongest pattern in *this* user's data surfaces first, not a fixed
// editorial order that's identical for everyone.
export function generateInsights(dailyData, max = 3) {
  const scored = [];
  for (const c of CANDIDATES) {
    const cmp = segmentComparison(dailyData, c.predicate, c.metricKey);
    if (!cmp) continue;
    scored.push({ icon: c.icon, title: c.title, accentColor: c.accentColor, body: c.body(cmp), effectSize: Math.abs(cmp.delta) / c.scale });
  }
  const corr = proteinEnergyCorrelation(dailyData);
  if (corr) scored.push(corr);

  scored.sort((a, b) => b.effectSize - a.effectSize);
  const results = scored.slice(0, max).map(({ icon, title, accentColor, body }) => ({ icon, title, accentColor, body }));

  if (results.length === 0) {
    const daysLogged = dailyData.filter(d => d.loggedMeals > 0).length;
    const daysCheckedIn = dailyData.filter(d => d.mood != null).length;
    const needed = Math.max(0, MIN_SAMPLE * 2 - Math.min(daysLogged, daysCheckedIn));
    results.push({
      icon: '🌱', title: 'Building your patterns', accentColor: '#6e8b74',
      body: needed > 0
        ? `Log food and check in on mood for about ${needed} more day${needed === 1 ? '' : 's'} and I'll start surfacing real patterns — not generic tips, actual correlations from your own data.`
        : `Nothing statistically meaningful yet across your logged days — keep going and patterns will surface as your data builds up.`,
    });
  }

  return results;
}

// ── templated mood-checkin response (replaces the old LLM call) ────────────
const MOOD_TIPS = {
  great: ['Nice — whatever you did today, your body agrees with it.', 'Great energy days are worth remembering. Note what you ate before this check-in.'],
  good: ['Solid day. A glass of water and a short walk can nudge this toward great.', 'Good baseline — keep today\'s meal timing if you can.'],
  okay: ['A steady day. If energy dips later, a protein-forward snack usually helps more than caffeine.', 'Okay is fine — try logging your next meal within the hour so patterns can start forming.'],
  low: ['Low days happen. Check if you\'ve had enough protein and water today before the evening.', 'If low mood tracks with a light day of eating, a proper meal now might help more than pushing through.'],
  tired: ['Tiredness often tracks with carb-heavy, protein-light meals — worth a look at what you\'ve logged today.', 'Consider an earlier, lighter dinner tonight and see how tomorrow\'s energy compares.'],
};

export function generateMoodResponse(moodId, energy) {
  const tips = MOOD_TIPS[moodId] || MOOD_TIPS.okay;
  const tip = tips[Math.floor(Math.random() * tips.length)];
  const energyNote = energy <= 3
    ? ' Energy is on the low side today — that\'s the pattern worth watching most.'
    : '';
  return tip + energyNote;
}

export { dateNDaysAgo, dateRange, MOOD_SCORE };
