// Pure logic for coach meal plans: the shape of a plan, validating it (mirrors
// valid_meal_plan_days in supabase/schema.sql — the database is the
// authority, this lets the editor say what's wrong before a round trip;
// mealPlan.test.js is the drift guard), per-day totals, the grocery list, and
// turning a planned item into a food-log entry.
import { sumFoodItems, scaleFood } from './foodMath';

export const DAYS = [
  { key: 'mon', label: 'Monday', short: 'Mon' },
  { key: 'tue', label: 'Tuesday', short: 'Tue' },
  { key: 'wed', label: 'Wednesday', short: 'Wed' },
  { key: 'thu', label: 'Thursday', short: 'Thu' },
  { key: 'fri', label: 'Friday', short: 'Fri' },
  { key: 'sat', label: 'Saturday', short: 'Sat' },
  { key: 'sun', label: 'Sunday', short: 'Sun' },
];
export const MEALS = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snacks', label: 'Snacks' },
];
export const LIMITS = { items: 20, name: 120, label: 60, calories: 5000, macro: 1000, planName: 80, notes: 2000, grams: 5000, src: 30, per100Calories: 1000, per100Macro: 100 };
const NUMERIC = ['calories', 'protein_g', 'carbs_g', 'fat_g'];
// An item picked from the food database also keeps the food's values per 100 g
// and the grams planned, so changing the weight re-works the macros.

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round = (n, dp = 0) => { const f = 10 ** dp; return Math.round(n * f) / f; };

// 'YYYY-MM-DD' -> 'mon'..'sun'. Read at UTC midnight so the answer depends only
// on the calendar date, never on the machine's timezone.
export function weekdayKey(isoDate) {
  const dow = new Date(`${String(isoDate).slice(0, 10)}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return Number.isNaN(dow) ? null : DAYS[(dow + 6) % 7].key;
}

export function newItem(over = {}) {
  return { name: '', label: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, ...over };
}

// Editor draft -> what gets stored: names/labels trimmed, numbers rounded and
// clamped to the allowed ranges, empty meals and days dropped.
export function cleanDays(days) {
  const out = {};
  for (const day of DAYS) {
    const meals = {};
    for (const meal of MEALS) {
      const items = (days?.[day.key]?.[meal.key] || []).map((raw) => {
        const item = { name: String(raw.name ?? '').trim() };
        const label = String(raw.label ?? '').trim();
        if (label) item.label = label;
        item.calories = Math.min(LIMITS.calories, Math.max(0, round(num(raw.calories))));
        for (const f of ['protein_g', 'carbs_g', 'fat_g']) item[f] = Math.min(LIMITS.macro, Math.max(0, round(num(raw[f]), 1)));
        if (isObj(raw.per100) && raw.grams != null) {
          item.grams = Math.min(LIMITS.grams, Math.max(0, round(num(raw.grams), 1)));
          item.per100 = {};
          for (const f of NUMERIC) item.per100[f] = Math.min(f === 'calories' ? LIMITS.per100Calories : LIMITS.per100Macro, Math.max(0, round(num(raw.per100[f]), 1)));
          const src = String(raw.src ?? '').trim().slice(0, LIMITS.src);
          if (src) item.src = src;
        }
        return item;
      });
      if (items.length) meals[meal.key] = items;
    }
    if (Object.keys(meals).length) out[day.key] = meals;
  }
  return out;
}

// null if the plan is acceptable, else the first problem in words.
export function validateMealPlan(days) {
  if (!isObj(days)) return 'The plan is malformed.';
  for (const [dayKey, day] of Object.entries(days)) {
    const dayLabel = DAYS.find((d) => d.key === dayKey)?.label;
    if (!dayLabel) return `Unknown day “${dayKey}”.`;
    if (!isObj(day)) return `${dayLabel} is malformed.`;
    for (const [mealKey, items] of Object.entries(day)) {
      const mealLabel = MEALS.find((m) => m.key === mealKey)?.label;
      if (!mealLabel) return `${dayLabel} has an unknown meal “${mealKey}”.`;
      if (!Array.isArray(items)) return `${dayLabel} ${mealLabel} is malformed.`;
      if (items.length > LIMITS.items) return `${dayLabel} ${mealLabel} can have at most ${LIMITS.items} items.`;
      for (const [i, item] of items.entries()) {
        const where = `${dayLabel} ${mealLabel}, item ${i + 1}`;
        if (!isObj(item)) return `${where} is malformed.`;
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        if (!name) return `${where} needs a name.`;
        if (name.length > LIMITS.name) return `${where}: the name is too long (${LIMITS.name} characters max).`;
        if (item.label != null && (typeof item.label !== 'string' || item.label.length > LIMITS.label)) return `${where}: the portion is too long (${LIMITS.label} characters max).`;
        for (const f of NUMERIC) {
          if (item[f] == null) continue;
          const max = f === 'calories' ? LIMITS.calories : LIMITS.macro;
          if (typeof item[f] !== 'number' || !Number.isFinite(item[f]) || item[f] < 0 || item[f] > max) return `${where}: ${f.replace('_g', '')} must be between 0 and ${max}.`;
        }
        if (item.grams != null && (typeof item.grams !== 'number' || !Number.isFinite(item.grams) || item.grams < 0 || item.grams > LIMITS.grams)) return `${where}: the weight must be between 0 and ${LIMITS.grams}g.`;
        if (item.src != null && (typeof item.src !== 'string' || item.src.length > LIMITS.src)) return `${where}: the food source is too long.`;
        if (item.per100 != null) {
          if (!isObj(item.per100)) return `${where}: the food's values per 100g are malformed.`;
          for (const [k, v] of Object.entries(item.per100)) {
            const max = k === 'calories' ? LIMITS.per100Calories : LIMITS.per100Macro;
            if (!NUMERIC.includes(k) || typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > max) return `${where}: the food's values per 100g are out of range.`;
          }
        }
        for (const k of Object.keys(item)) if (![...NUMERIC, 'name', 'label', 'grams', 'src', 'per100'].includes(k)) return `${where}: unexpected field “${k}”.`;
      }
    }
  }
  return null;
}

export function mealTotals(items) {
  const t = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const item of items || []) for (const f of NUMERIC) t[f] += num(item[f]);
  return { calories: round(t.calories), protein_g: round(t.protein_g, 1), carbs_g: round(t.carbs_g, 1), fat_g: round(t.fat_g, 1) };
}

export function dayTotals(day) {
  return mealTotals(MEALS.flatMap((m) => day?.[m.key] || []));
}

export const planHasItems = (days) => DAYS.some((d) => MEALS.some((m) => (days?.[d.key]?.[m.key] || []).length > 0));

// A recipe (saved_meals row) as one plan item — per serving, like the Recipes
// page's own "log a serving".
export function recipeToItem(recipe) {
  const totals = sumFoodItems(recipe.items || []);
  const per = scaleFood(totals, 1 / (Number(recipe.servings) || 1));
  return newItem({
    name: String(recipe.name || '').slice(0, LIMITS.name),
    label: '1 serving',
    calories: Math.min(LIMITS.calories, Math.max(0, Math.round(per.cal))),
    protein_g: Math.min(LIMITS.macro, Math.max(0, round(per.protein, 1))),
    carbs_g: Math.min(LIMITS.macro, Math.max(0, round(per.carbs, 1))),
    fat_g: Math.min(LIMITS.macro, Math.max(0, round(per.fat, 1))),
  });
}

// A planned item in the shape the food log takes (see useFoodLogs.addFood).
export function itemToFood(item) {
  return {
    name: item.name,
    cal: num(item.calories), protein: num(item.protein_g), carbs: num(item.carbs_g), fat: num(item.fat_g),
    servingLabel: item.label || null,
    ...(item.per100 && item.grams > 0 ? { servingGrams: item.grams } : {}),
    source: 'plan',
  };
}

// ── items picked from the food database ──────────────────────────────────────
const linkedMacros = (per100, grams) => ({
  calories: Math.min(LIMITS.calories, Math.max(0, Math.round((num(per100.calories) * grams) / 100))),
  protein_g: Math.min(LIMITS.macro, Math.max(0, round((num(per100.protein_g) * grams) / 100, 1))),
  carbs_g: Math.min(LIMITS.macro, Math.max(0, round((num(per100.carbs_g) * grams) / 100, 1))),
  fat_g: Math.min(LIMITS.macro, Math.max(0, round((num(per100.fat_g) * grams) / 100, 1))),
});

export const isLinked = (item) => !!item?.per100 && item.grams != null;

// A food-database result ({ name, src, per100, defaultGrams } — see
// lib/planFoodSearch.js) as a plan item at its default weight.
export function itemFromFood(food) {
  // No known weight to scale from: a plain item with the serving's own numbers.
  if (!food.per100) {
    const f = food.fixed || {};
    return newItem({
      name: String(food.name || '').slice(0, LIMITS.name),
      label: String(food.servingLabel || '1 serving').slice(0, LIMITS.label),
      calories: Math.min(LIMITS.calories, Math.max(0, Math.round(num(f.calories)))),
      protein_g: Math.min(LIMITS.macro, Math.max(0, round(num(f.protein_g), 1))),
      carbs_g: Math.min(LIMITS.macro, Math.max(0, round(num(f.carbs_g), 1))),
      fat_g: Math.min(LIMITS.macro, Math.max(0, round(num(f.fat_g), 1))),
    });
  }
  const grams = food.defaultGrams > 0 ? food.defaultGrams : 100;
  return newItem({
    name: String(food.name || '').slice(0, LIMITS.name),
    label: `${round(grams, 1)}g`,
    grams,
    per100: { ...food.per100 },
    src: String(food.src || '').slice(0, LIMITS.src),
    ...linkedMacros(food.per100, grams),
  });
}

// Changes a linked item's weight and re-works its macros from the food's values
// per 100 g. Anything else is returned untouched.
export function setItemGrams(item, rawGrams) {
  if (!isLinked(item)) return item;
  const grams = Math.min(LIMITS.grams, Math.max(0, num(rawGrams)));
  return { ...item, grams, label: `${round(grams, 1)}g`, ...linkedMacros(item.per100, grams) };
}

// Typing over the numbers of a linked item means the coach knows better than the
// database — keep what they typed and drop the link, so the two never disagree.
export function unlinkItem(item) {
  const { per100, grams, src, ...rest } = item; // eslint-disable-line no-unused-vars
  return rest;
}

// Copies one day's meals onto other days (deep copy — editing one afterwards
// mustn't change the other). Returns a new plan.
export function copyDay(days, fromKey, toKeys) {
  const next = { ...days };
  const source = days?.[fromKey];
  for (const key of toKeys) {
    if (key === fromKey) continue;
    if (source) next[key] = JSON.parse(JSON.stringify(source)); else delete next[key];
  }
  return next;
}

// "What do I need to buy": every item across the week, grouped by name and
// portion (case-insensitively) with how many times it appears. Quantities are
// free text ("150g", "1 cup"), so counting occurrences — not summing amounts —
// is the honest thing to do; the list says "×3", not "450g".
export function groceryList(days, { onlyDays = null } = {}) {
  const groups = new Map();
  for (const day of DAYS) {
    if (onlyDays && !onlyDays.includes(day.key)) continue;
    for (const meal of MEALS) {
      for (const item of days?.[day.key]?.[meal.key] || []) {
        const name = String(item.name || '').trim();
        if (!name) continue;
        const label = String(item.label || '').trim();
        const key = `${name.toLowerCase()}|${label.toLowerCase()}`;
        const g = groups.get(key) || { key, name, label, count: 0 };
        g.count += 1;
        groups.set(key, g);
      }
    }
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name) || a.label.localeCompare(b.label));
}

export function groceryText(list) {
  return list.map((g) => `• ${g.name}${g.label ? ` (${g.label})` : ''}${g.count > 1 ? ` ×${g.count}` : ''}`).join('\n');
}

// Which of a day's planned meals has the client already logged from the plan?
// A meal counts once every planned item has a matching logged item (same meal,
// same name, logged from the plan) — matched one-for-one, so a meal planned
// with two identical items needs both logged. `logged` are food-log items as
// the app maps them ({ meal, name, source }).
export function loggedPlanMeals(day, logged) {
  const done = new Set();
  for (const meal of MEALS) {
    const planned = day?.[meal.key] || [];
    if (planned.length === 0) continue;
    const pool = (logged || []).filter((l) => l.source === 'plan' && l.meal === meal.key).map((l) => String(l.name).trim().toLowerCase());
    let all = true;
    for (const item of planned) {
      const at = pool.indexOf(String(item.name).trim().toLowerCase());
      if (at === -1) { all = false; break; }
      pool.splice(at, 1);
    }
    if (all) done.add(meal.key);
  }
  return done;
}
