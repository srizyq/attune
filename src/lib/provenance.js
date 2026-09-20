// How trustworthy is a logged food's nutrition data? Every food_logs row
// records where it came from (`source`); this groups those into tiers a coach
// can read at a glance, because "what she ate" is only as good as the data
// behind it — an AI-estimated curry and a lab-analysed chicken breast
// shouldn't look equally certain in a report someone makes decisions from.
//
// Every value FoodSearch.jsx writes to `source` must appear in BY_SOURCE:
// provenance.test.js scans that file and fails on a new one, so adding a
// data source can't quietly land in "unspecified".
export const PROVENANCE = {
  verified: { label: 'Verified database', short: 'Verified', tone: 'good', description: 'AUSNUT 2023 — Australian government food composition data' },
  database: { label: 'Food database', short: 'Database', tone: 'good', description: 'A curated food-database entry (FatSecret)' },
  community: { label: 'Community-submitted', short: 'Community', tone: 'fair', description: 'Crowd-sourced (Open Food Facts, community barcodes) — accuracy varies' },
  ai: { label: 'AI estimate', short: 'AI estimate', tone: 'ai', description: 'Estimated by AI from a photo, menu or description — treat as approximate' },
  custom: { label: 'Client-entered', short: 'Custom', tone: 'fair', description: 'A food the client created themselves' },
  plan: { label: 'Coach plan', short: 'Coach plan', tone: 'none', description: 'From a meal plan your coach set — the values are the coach\'s own' },
  recipe: { label: 'Recipe', short: 'Recipe', tone: 'none', description: 'Calculated from the recipe\'s ingredients' },
  unknown: { label: 'Unspecified', short: 'Unspecified', tone: 'none', description: 'Logged before sources were recorded' },
};

export const BY_SOURCE = {
  ausnut: 'verified',
  fatsecret: 'database',
  off: 'community',
  community: 'community',
  'common-dish': 'ai',
  'ai-estimate': 'ai',
  photo: 'ai',
  menu: 'ai',
  custom: 'custom',
  recipe: 'recipe',
  plan: 'plan',
};

// Older rows and re-logged items carry these generic values instead of a real
// origin; they're deliberately "unspecified".
export const GENERIC_SOURCES = ['local', 'log', 'favourite'];

export function provenanceOf(source) {
  return BY_SOURCE[String(source ?? '').toLowerCase()] || 'unknown';
}

// Share of calories by provenance tier, largest first, whole percents that add
// to exactly 100 (the largest tier absorbs rounding). Weighted by calories, not
// item count: a 30-calorie AI-estimated garnish shouldn't outweigh a database
// meal. Rows with no calories are ignored; nothing to weigh -> [].
export function provenanceBreakdown(rows, calories = (r) => Number(r.calories) || 0, source = (r) => r.source) {
  const totals = new Map();
  let all = 0;
  for (const row of rows || []) {
    const cal = calories(row);
    if (!(cal > 0)) continue;
    const key = provenanceOf(source(row));
    totals.set(key, (totals.get(key) || 0) + cal);
    all += cal;
  }
  if (all === 0) return [];
  const list = [...totals.entries()].map(([key, cal]) => ({ key, calories: cal, pct: Math.round((cal / all) * 100) })).sort((a, b) => b.calories - a.calories);
  const drift = 100 - list.reduce((s, x) => s + x.pct, 0);
  list[0].pct += drift;
  return list;
}

// One line for a report or a card, e.g. "72% database · 28% AI estimate".
export function describeBreakdown(breakdown) {
  return breakdown.map((b) => `${b.pct}% ${PROVENANCE[b.key].short.toLowerCase()}`).join(' · ');
}
