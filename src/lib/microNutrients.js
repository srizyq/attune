// Single source of truth for every trackable micronutrient — shared by
// Nutrients.jsx (display) and Settings.jsx (Pro custom target editor) so
// the two can't drift out of sync on units, labels, or which nutrients
// exist. `pro: true` means free users see it blurred/locked on the
// Nutrients page — that's unrelated to target *editing*, which is Pro-only
// for every nutrient regardless of `pro`, since only Pro users reach the editor.
//
// `defaultTarget` is a numeric standard-adult-RDI figure (midpoint of a
// range, or the cap for a "under X" guideline) used to draw a progress
// bar even when someone hasn't set a custom target — without it, most
// cards (custom targets are Pro-only and opt-in, so most users never set
// one) had nothing but a bare number and static guideline text, which is
// what read as "empty boxes". Left undefined for the two nutrients whose
// guideline isn't a target at all ("as low as possible", "favour over
// saturated fat") — there's no meaningful "% of goal" for those.
export const MICRO_NUTRIENTS = [
  { key: 'fibre', column: 'fibre_g', label: 'Fibre', unit: 'g', icon: 'ti-leaf', color: 'var(--accent)', guideline: 'Guideline: 25–30g/day', defaultTarget: 28, pro: false },
  { key: 'sodium', column: 'sodium_mg', label: 'Sodium', unit: 'mg', icon: 'ti-droplet', color: 'var(--water-blue)', guideline: 'Guideline: under 2,300mg/day', defaultTarget: 2300, pro: false },
  { key: 'sugar', column: 'sugar_g', label: 'Sugar', unit: 'g', icon: 'ti-candy', color: 'var(--gold)', guideline: 'Guideline: under 50g/day', defaultTarget: 50, pro: false },
  { key: 'saturatedFat', column: 'saturated_fat_g', label: 'Saturated fat', unit: 'g', icon: 'ti-droplet-filled', color: 'var(--gold)', guideline: 'Guideline: under 20g/day', defaultTarget: 20, pro: false },
  { key: 'transFat', column: 'trans_fat_g', label: 'Trans fat', unit: 'g', icon: 'ti-alert-triangle', color: 'var(--ai-purple)', guideline: 'Guideline: as low as possible', pro: false },
  { key: 'cholesterol', column: 'cholesterol_mg', label: 'Cholesterol', unit: 'mg', icon: 'ti-egg', color: 'var(--water-blue)', guideline: 'Guideline: under 300mg/day', defaultTarget: 300, pro: false },
  { key: 'addedSugar', column: 'added_sugar_g', label: 'Added sugar', unit: 'g', icon: 'ti-candy', color: 'var(--gold)', guideline: 'Guideline: under 25g/day', defaultTarget: 25, pro: false },
  { key: 'potassium', column: 'potassium_mg', label: 'Potassium', unit: 'mg', icon: 'ti-bolt', color: 'var(--accent)', guideline: 'Guideline: 2,600–3,400mg/day', defaultTarget: 3000, pro: false },
  { key: 'vitaminD', column: 'vitamin_d_mcg', label: 'Vitamin D', unit: 'mcg', icon: 'ti-sun', color: 'var(--gold)', guideline: 'Guideline: 15mcg/day', defaultTarget: 15, pro: false },
  { key: 'calcium', column: 'calcium_mg', label: 'Calcium', unit: 'mg', icon: 'ti-bone', color: 'var(--water-blue)', guideline: 'Guideline: 1,000mg/day', defaultTarget: 1000, pro: false },
  { key: 'iron', column: 'iron_mg', label: 'Iron', unit: 'mg', icon: 'ti-droplet', color: 'var(--ai-purple)', guideline: 'Guideline: 8–18mg/day', defaultTarget: 13, pro: false },
  { key: 'vitaminA', column: 'vitamin_a_mcg', label: 'Vitamin A', unit: 'mcg', icon: 'ti-apple', color: 'var(--gold)', guideline: 'Guideline: 700–900mcg/day', defaultTarget: 800, pro: true },
  { key: 'vitaminC', column: 'vitamin_c_mg', label: 'Vitamin C', unit: 'mg', icon: 'ti-lemon2', color: 'var(--accent)', guideline: 'Guideline: 45mg/day', defaultTarget: 45, pro: true },
  { key: 'vitaminB12', column: 'vitamin_b12_mcg', label: 'Vitamin B12', unit: 'mcg', icon: 'ti-pill', color: 'var(--ai-purple)', guideline: 'Guideline: 2.4mcg/day', defaultTarget: 2.4, pro: true },
  { key: 'folate', column: 'folate_mcg', label: 'Folate', unit: 'mcg', icon: 'ti-seeding', color: 'var(--water-blue)', guideline: 'Guideline: 400mcg/day', defaultTarget: 400, pro: true },
  { key: 'magnesium', column: 'magnesium_mg', label: 'Magnesium', unit: 'mg', icon: 'ti-battery', color: 'var(--accent)', guideline: 'Guideline: 310–420mg/day', defaultTarget: 365, pro: true },
  { key: 'zinc', column: 'zinc_mg', label: 'Zinc', unit: 'mg', icon: 'ti-shield', color: 'var(--gold)', guideline: 'Guideline: 8–11mg/day', defaultTarget: 9.5, pro: true },
  { key: 'polyunsaturatedFat', column: 'polyunsaturated_fat_g', label: 'Polyunsaturated fat', unit: 'g', icon: 'ti-fish', color: 'var(--water-blue)', guideline: 'A source of essential fatty acids', pro: true },
  { key: 'monounsaturatedFat', column: 'monounsaturated_fat_g', label: 'Monounsaturated fat', unit: 'g', icon: 'ti-droplet-half-2', color: 'var(--ai-purple)', guideline: 'Guideline: favour over saturated fat', pro: true },
  // ── Extended nutrients ────────────────────────────────────────────────────
  // Only some food sources carry these (AUSNUT does; FatSecret, Open Food
  // Facts and AI estimates don't), so — unlike everything above — an unknown
  // value is stored as NULL, never 0: "no data" must not read as "none".
  // Totals count only foods that have data and say how many that was (see
  // extendedCoverage). `extended: true` is what switches all of that on.
  { key: 'thiamin', column: 'thiamin_mg', extended: true, label: 'Thiamin (B1)', unit: 'mg', icon: 'ti-pill', color: 'var(--accent)', guideline: 'Guideline: 1.1–1.2mg/day', defaultTarget: 1.15, pro: true },
  { key: 'riboflavin', column: 'riboflavin_mg', extended: true, label: 'Riboflavin (B2)', unit: 'mg', icon: 'ti-pill', color: 'var(--water-blue)', guideline: 'Guideline: 1.1–1.3mg/day', defaultTarget: 1.2, pro: true },
  { key: 'niacin', column: 'niacin_mg', extended: true, label: 'Niacin (B3)', unit: 'mg', icon: 'ti-pill', color: 'var(--gold)', guideline: 'Guideline: 14–16mg/day (niacin equivalents)', defaultTarget: 15, pro: true },
  { key: 'vitaminB6', column: 'vitamin_b6_mg', extended: true, label: 'Vitamin B6', unit: 'mg', icon: 'ti-pill', color: 'var(--ai-purple)', guideline: 'Guideline: 1.3mg/day', defaultTarget: 1.3, pro: true },
  { key: 'vitaminE', column: 'vitamin_e_mg', extended: true, label: 'Vitamin E', unit: 'mg', icon: 'ti-sparkles', color: 'var(--accent)', guideline: 'Guideline: 7–10mg/day', defaultTarget: 8.5, pro: true },
  { key: 'phosphorus', column: 'phosphorus_mg', extended: true, label: 'Phosphorus', unit: 'mg', icon: 'ti-bone', color: 'var(--water-blue)', guideline: 'Guideline: 1,000mg/day', defaultTarget: 1000, pro: true },
  { key: 'selenium', column: 'selenium_mcg', extended: true, label: 'Selenium', unit: 'mcg', icon: 'ti-shield', color: 'var(--gold)', guideline: 'Guideline: 60–70mcg/day', defaultTarget: 65, pro: true },
  { key: 'iodine', column: 'iodine_mcg', extended: true, label: 'Iodine', unit: 'mcg', icon: 'ti-droplet', color: 'var(--ai-purple)', guideline: 'Guideline: 150mcg/day', defaultTarget: 150, pro: true },
  { key: 'omega3', column: 'omega3_mg', extended: true, label: 'Omega-3 (long chain)', unit: 'mg', icon: 'ti-fish', color: 'var(--water-blue)', guideline: 'Suggested: 430–610mg/day (EPA + DPA + DHA)', defaultTarget: 500, pro: true },
  { key: 'omega6', column: 'omega6_g', extended: true, label: 'Omega-6 (linoleic acid)', unit: 'g', icon: 'ti-droplet-half-2', color: 'var(--gold)', guideline: 'Adequate intake: 8–13g/day', defaultTarget: 10, pro: true },
  { key: 'alphaLinolenicAcid', column: 'ala_g', extended: true, label: 'Alpha-linolenic acid', unit: 'g', icon: 'ti-leaf', color: 'var(--accent)', guideline: 'Adequate intake: 0.8–1.3g/day', defaultTarget: 1, pro: true },
  { key: 'caffeine', column: 'caffeine_mg', extended: true, label: 'Caffeine', unit: 'mg', icon: 'ti-coffee', color: 'var(--gold)', guideline: 'Guideline: up to 400mg/day', defaultTarget: 400, pro: true },
  { key: 'alcohol', column: 'alcohol_g', extended: true, label: 'Alcohol', unit: 'g', icon: 'ti-glass', color: 'var(--ai-purple)', guideline: 'A standard drink is 10g of alcohol', pro: true },
];

export const MICRO_KEYS = MICRO_NUTRIENTS.map((m) => m.key);
export const EXTENDED_NUTRIENTS = MICRO_NUTRIENTS.filter((m) => m.extended);
export const EXTENDED_KEYS = EXTENDED_NUTRIENTS.map((m) => m.key);
// key -> the food_logs / ausnut_foods column behind it.
export const MICRO_COLUMNS = Object.fromEntries(MICRO_NUTRIENTS.map((m) => [m.key, m.column]));

const hasValue = (v) => v != null && v !== '' && Number.isFinite(Number(v));

// A database row -> the extended nutrients on an app-side food/log item.
// NULL stays null (unknown), a real 0 stays 0 (measured: none).
export function extendedFromRow(row) {
  return Object.fromEntries(EXTENDED_NUTRIENTS.map((m) => [m.key, hasValue(row?.[m.column]) ? Number(row[m.column]) : null]));
}

// An app-side food/log item -> the extended columns to write. Nutrients with no
// value are left OUT (not written as 0 or null): the column then takes its own
// NULL default, and — just as importantly — a database that hasn't been
// updated yet never sees a column it doesn't have unless real data needs it.
export function extendedToRow(entry) {
  const out = {};
  for (const m of EXTENDED_NUTRIENTS) if (hasValue(entry?.[m.key])) out[m.column] = Number(entry[m.key]);
  return out;
}

// Sum of the extended nutrients over a set of logged items, counting only items
// that actually carry a value, plus how many did. { key: { total, withData, of } }
export function extendedCoverage(items) {
  const list = items || [];
  return Object.fromEntries(EXTENDED_NUTRIENTS.map((m) => {
    let total = 0;
    let withData = 0;
    for (const item of list) {
      const v = item?.[m.key];
      if (hasValue(v)) { total += Number(v); withData += 1; }
    }
    return [m.key, { total, withData, of: list.length }];
  }));
}

// A nutrient's value as shown: two decimals for the extended ones (B vitamins
// are hundredths of a milligram), one for other g/mg figures, whole numbers
// for mcg. Returns a number, so cards can still do arithmetic with it.
export function formatMicro(nutrient, value) {
  const v = Number(value) || 0;
  const dp = nutrient.extended ? 2 : nutrient.unit === 'g' || nutrient.unit === 'mg' ? 1 : 0;
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// How many of a set of logged items carry data for the extended nutrients at
// all (any one of them) — what the "based on N of M foods" note is built from.
export function extendedSummary(items) {
  const list = items || [];
  const withData = list.filter((item) => EXTENDED_KEYS.some((k) => hasValue(item?.[k]))).length;
  return { withData, of: list.length };
}

// The sentence that goes with extended totals; null when there's nothing to say.
export function extendedNote({ withData, of }) {
  if (of === 0) return null;
  if (withData === 0) return 'None of the foods logged carry these — only some food databases (like AUSNUT) do.';
  return `Based on ${withData} of ${of} foods logged. Only some food databases carry these, so treat the totals as a minimum.`;
}

// The older nutrients favourite_foods only gained columns for in the
// "Favourite foods: all nutrients" update (it began with the first eleven).
export const FAVOURITE_LATE_KEYS = ['vitaminA', 'vitaminC', 'vitaminB12', 'folate', 'magnesium', 'zinc', 'polyunsaturatedFat', 'monounsaturatedFat'];

// The favourite_foods columns that need that update, for one food: the extended
// nutrients it carries (0 is a real value) and the late older ones that are
// non-zero — a zero there is the column default anyway, so leaving it out keeps
// a database without the update from ever seeing a column it doesn't have.
export function lateFavouriteToRow(food) {
  const out = extendedToRow(food);
  for (const key of FAVOURITE_LATE_KEYS) {
    const v = Number(food?.[key]);
    if (Number.isFinite(v) && v !== 0) out[MICRO_COLUMNS[key]] = v;
  }
  return out;
}

