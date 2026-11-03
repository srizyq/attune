// The numbers behind the Custom food form: calories from macros, how well the
// calories typed in agree with the macros, and a nutrition-label reading as form
// values. Pure, so the maths is unit-tested.
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

// Calories each macro supplies, and the total, as whole numbers.
export function macroKcal({ protein, carbs, fat } = {}) {
  const p = Math.round(num(protein) * KCAL_PER_G.protein);
  const c = Math.round(num(carbs) * KCAL_PER_G.carbs);
  const f = Math.round(num(fat) * KCAL_PER_G.fat);
  return { protein: p, carbs: c, fat: f, total: p + c + f };
}

// 0-100: how close the calories typed in are to what the macros add up to. 100 is
// a match; null when there is nothing to compare (no macros, no calories).
export function calorieMatch(entered, derived) {
  const e = num(entered), d = num(derived);
  if (!e && !d) return null;
  if (!e || !d) return 0;
  return Math.round((Math.min(e, d) / Math.max(e, d)) * 100);
}

// How the match reads: 'good' from 90, 'close' from 75, else 'off'.
export function matchTone(pct) {
  if (pct == null) return 'none';
  if (pct >= 90) return 'good';
  if (pct >= 75) return 'close';
  return 'off';
}

// What the /api/recognize-label reply means for the form: text values, so they drop
// straight into the inputs. Missing numbers stay empty rather than becoming a 0.
const text = (v) => (v == null || v === '' ? '' : String(v));
export function labelToForm(data = {}) {
  return {
    servingLabel: data.serving || '',
    servingGrams: text(data.servingGrams),
    cal: text(data.cal),
    protein: text(data.protein),
    carbs: text(data.carbs),
    fat: text(data.fat),
    fibre: text(data.fibre),
    sodium: text(data.sodium),
    sugar: text(data.sugar),
  };
}

// The weight stepper moves in sensible steps: 5 g up to 100 g, then 10 g, then 25 g.
export function weightStep(grams) {
  const g = num(grams);
  return g < 100 ? 5 : g < 500 ? 10 : 25;
}
