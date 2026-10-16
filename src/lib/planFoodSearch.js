// Food-database search for the meal plan editor: AUSNUT, common dishes and the
// coach's own foods, as one list of { key, name, src, per100, defaultGrams }.
// `per100` is the food's values per 100 g (so a planned weight can scale them);
// a food with no known serving weight comes back with per100: null and its
// numbers as a fixed serving instead.
import { searchAusnutFoods, searchCommonDishes } from './db';
import { LIMITS } from './mealPlan';

const num = (v) => Number(v) || 0;
const r1 = (n) => Math.round(n * 10) / 10;

const withinLimits = (p) => p.calories <= LIMITS.per100Calories && p.protein_g <= LIMITS.per100Macro && p.carbs_g <= LIMITS.per100Macro && p.fat_g <= LIMITS.per100Macro;

export function ausnutToPlanFood(row) {
  const per100 = { calories: Math.round(num(row.calories)), protein_g: r1(num(row.protein_g)), carbs_g: r1(num(row.carbs_g)), fat_g: r1(num(row.fat_g)) };
  return { key: `ausnut:${row.id}`, name: row.name, src: 'AUSNUT', per100: withinLimits(per100) ? per100 : null, defaultGrams: 100, fixed: perServing(row) };
}

// A food whose numbers are per serving (a common dish, or one of the coach's
// own): scaled to per 100 g when the serving's weight is known.
export function servingToPlanFood(row, src, keyPrefix) {
  const grams = num(row.serving_grams);
  const fixed = perServing(row);
  const base = { key: `${keyPrefix}:${row.id}`, name: row.name, src, fixed, servingLabel: row.serving_label || '1 serving' };
  if (grams > 0) {
    const per100 = {
      calories: Math.round((num(row.calories) * 100) / grams), protein_g: r1((num(row.protein_g) * 100) / grams),
      carbs_g: r1((num(row.carbs_g) * 100) / grams), fat_g: r1((num(row.fat_g) * 100) / grams),
    };
    if (withinLimits(per100)) return { ...base, per100, defaultGrams: r1(grams) };
  }
  return { ...base, per100: null, defaultGrams: null };
}

function perServing(row) {
  return { calories: Math.round(num(row.calories)), protein_g: r1(num(row.protein_g)), carbs_g: r1(num(row.carbs_g)), fat_g: r1(num(row.fat_g)) };
}

const words = (q) => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

export async function searchPlanFoods(query, { customFoods = [] } = {}) {
  const ws = words(query);
  if (ws.length === 0) return [];
  const mine = customFoods.filter((f) => ws.every((w) => String(f.name).toLowerCase().includes(w))).slice(0, 5).map((f) => servingToPlanFood(f, 'My foods', 'custom'));
  const [ausnut, dishes] = await Promise.all([
    searchAusnutFoods(query, 8).catch((err) => { console.error('AUSNUT search failed:', err); return []; }),
    searchCommonDishes(query, 5).catch((err) => { console.error('Common dishes search failed:', err); return []; }),
  ]);
  return [...mine, ...ausnut.map(ausnutToPlanFood), ...dishes.map((d) => servingToPlanFood(d, 'Common dish', 'dish'))];
}
