// Pure helpers behind the scan result pages (barcode, photo, menu): daily-goal
// percentages, the protein/carb/fat energy split, % daily value rows, dietary
// badges and the one-line "insight" sentences. Kept free of React so the
// wording and the maths are unit-tested — every number a user is told here is
// derived from their own targets and the food in front of them.

const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

// Whole-number percentage of `target` that `value` is, or null when there is
// no usable target (so callers hide the chip rather than show "0%" or "NaN%").
export function percentOf(value, target) {
  const v = Number(value);
  const t = Number(target);
  if (!Number.isFinite(v) || !Number.isFinite(t) || t <= 0) return null;
  return Math.max(0, Math.round((v / t) * 100));
}

// Share of the food's calories that come from each macro, as whole numbers
// that always add up to 100. null for a food with no macro energy at all.
export function energySplit({ protein = 0, carbs = 0, fat = 0 }) {
  const kcal = {
    protein: (Number(protein) || 0) * KCAL_PER_G.protein,
    carbs: (Number(carbs) || 0) * KCAL_PER_G.carbs,
    fat: (Number(fat) || 0) * KCAL_PER_G.fat,
  };
  const total = kcal.protein + kcal.carbs + kcal.fat;
  if (total <= 0) return null;
  const pct = {
    protein: Math.round((kcal.protein / total) * 100),
    carbs: Math.round((kcal.carbs / total) * 100),
    fat: Math.round((kcal.fat / total) * 100),
  };
  // Rounding can land on 99 or 101; give the difference to the largest share.
  const diff = 100 - (pct.protein + pct.carbs + pct.fat);
  if (diff !== 0) {
    const biggest = Object.keys(pct).reduce((a, b) => (pct[b] > pct[a] ? b : a));
    pct[biggest] += diff;
  }
  return pct;
}

// FDA-style reference daily values, used only for the "% daily value" column.
export const DAILY_VALUES = {
  saturatedFat: 20, // g
  cholesterol: 300, // mg
  sodium: 2300, // mg
  fibre: 28, // g
  potassium: 4700, // mg
  calcium: 1300, // mg
  vitaminD: 20, // mcg
  iron: 18, // mg
  addedSugar: 50, // g
};

// Nutrition Facts rows for a scaled food. Fibre, sugar and sodium are always
// shown (every source carries them); the rest only when the source actually
// reported a value, so a missing nutrient never reads as a confident "0".
const ROWS = [
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g', always: false },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', always: false },
  { key: 'sodium', label: 'Sodium', unit: 'mg', always: true },
  { key: 'fibre', label: 'Dietary fibre', unit: 'g', always: true },
  { key: 'sugar', label: 'Total sugars', unit: 'g', always: true, note: 'addedSugar' },
  { key: 'calcium', label: 'Calcium', unit: 'mg', always: false },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', always: false },
  { key: 'iron', label: 'Iron', unit: 'mg', always: false },
  { key: 'potassium', label: 'Potassium', unit: 'mg', always: false },
];

export function nutritionRows(food) {
  return ROWS
    .map((r) => {
      const value = Number(food?.[r.key]);
      const known = Number.isFinite(value) && value > 0;
      if (!r.always && !known) return null;
      const dv = DAILY_VALUES[r.key] ? percentOf(known ? value : 0, DAILY_VALUES[r.key]) : null;
      const added = r.note ? Number(food?.[r.note]) : 0;
      return {
        key: r.key,
        label: r.label,
        value: known ? value : 0,
        unit: r.unit,
        dv,
        sub: r.note && added > 0 ? `Includes ${added}g added sugars` : null,
      };
    })
    .filter(Boolean);
}

// Small descriptor under each macro tile ("High", "3g sugar", "Low fat").
export function macroNotes(food) {
  const protein = Number(food?.protein) || 0;
  const fat = Number(food?.fat) || 0;
  const sugar = Number(food?.sugar) || 0;
  return {
    protein: protein >= 15 ? 'High' : protein > 0 && protein <= 3 ? 'Low' : null,
    carbs: sugar > 0 ? `${sugar}g sugar` : null,
    fat: fat >= 20 ? 'High' : fat <= 3 ? 'Low fat' : null,
  };
}

// Open Food Facts tags -> readable badges. Only tags it actually reports are
// shown; unknown tags are ignored rather than guessed at.
const LABEL_BADGES = [
  ['en:gluten-free', 'Gluten-free'],
  ['en:vegan', 'Vegan'],
  ['en:vegetarian', 'Vegetarian'],
  ['en:organic', 'Organic'],
  ['en:no-added-sugar', 'No added sugar'],
  ['en:no-sugar-added', 'No added sugar'],
  ['en:no-palm-oil', 'No palm oil'],
  ['en:palm-oil-free', 'No palm oil'],
  ['en:non-gmo-project', 'Non-GMO'],
  ['en:no-gmos', 'Non-GMO'],
  ['en:kosher', 'Kosher'],
  ['en:halal', 'Halal'],
  ['en:lactose-free', 'Lactose-free'],
];

export function dietaryBadges({ labels = [], food } = {}) {
  const out = [];
  const have = new Set((labels || []).map((l) => String(l).toLowerCase()));
  for (const [tag, text] of LABEL_BADGES) {
    if (have.has(tag) && !out.includes(text)) out.push(text);
  }
  // Worked out from the numbers on screen, so they hold for any source.
  const protein = Number(food?.protein) || 0;
  const cal = Number(food?.cal) || 0;
  const fibre = Number(food?.fibre) || 0;
  const sugar = Number(food?.sugar) || 0;
  if (cal > 0 && protein >= 10 && (protein * 4) / cal >= 0.3) out.push('High protein');
  if (fibre >= 5) out.push('High fibre');
  if (cal > 0 && sugar > 0 && sugar <= 5) out.push('Low sugar');
  return out;
}

const NUTRI_TONES = {
  a: 'var(--accent-secondary)',
  b: 'var(--accent-secondary)',
  c: 'var(--text-muted)',
  d: 'var(--macro-carbs)',
  e: 'var(--macro-fat)',
};

export function nutriScoreInfo(grade) {
  const g = String(grade || '').toLowerCase();
  if (!NUTRI_TONES[g]) return null;
  return { grade: g.toUpperCase(), color: NUTRI_TONES[g] };
}

// Shared by all three scans: how a food sits against today's targets.
//   targets  { calories, protein_g, carbs_g, fat_g }
//   consumed { cal, protein }   (today's logs so far)
// Returns null when there is no calorie target, so no card is shown.
export function dayFit({ cal = 0, protein = 0 }, targets, consumed = {}) {
  const target = Number(targets?.calories) || 0;
  if (target <= 0) return null;
  const eaten = Number(consumed.cal) || 0;
  const left = Math.round(target - eaten);
  const proteinTarget = Number(targets?.protein_g) || 0;
  return {
    calPct: percentOf(cal, target),
    proteinPct: proteinTarget > 0 ? percentOf(protein, proteinTarget) : null,
    left,
    leftAfter: Math.round(left - cal),
    over: cal > Math.max(0, left),
  };
}

// The one-line "Smart synergy" sentence for a single product. Returns
// { tag, text } or null.
export function productInsight(food, targets, consumed) {
  const fit = dayFit(food, targets, consumed);
  if (!fit) return null;
  const { calPct, proteinPct, left, over } = fit;
  if (over) {
    return {
      tag: 'Over budget',
      text: left > 0
        ? `This is ${Math.round(food.cal)} kcal and only ${left} kcal are left today. Try a smaller portion to stay on target.`
        : `You've already reached today's calorie target, so this would put you over it.`,
    };
  }
  if (proteinPct != null && proteinPct >= 5) {
    const strong = calPct != null && proteinPct >= Math.max(10, calPct * 1.5);
    return {
      tag: strong ? 'High value' : 'Fits your day',
      text: `Fulfils ${proteinPct}% of your daily protein target while using ${calPct}% of your daily calories.`,
    };
  }
  return {
    tag: 'Fits your day',
    text: `Uses ${calPct}% of your daily calories and leaves you ${fit.leftAfter} kcal for the rest of the day.`,
  };
}

// Plate/menu-flavoured sentence (photo + menu fallback when the AI doesn't
// supply its own): leans on protein against what is still remaining today.
export function plateInsight(totals, targets, consumed = {}) {
  const fit = dayFit(totals, targets, consumed);
  if (!fit) return null;
  const proteinTarget = Number(targets?.protein_g) || 0;
  const proteinLeft = Math.max(0, proteinTarget - (Number(consumed.protein) || 0));
  if (proteinTarget > 0 && proteinLeft > 0 && Number(totals.protein) > 0) {
    const share = percentOf(totals.protein, proteinLeft);
    return {
      tag: 'Your goal',
      text: `Delivers ${share}% of your remaining protein target for ${fit.calPct}% of your daily calories.`,
    };
  }
  return {
    tag: 'Your goal',
    text: `Uses ${fit.calPct}% of your daily calories and leaves you ${fit.leftAfter} kcal for the rest of the day.`,
  };
}
