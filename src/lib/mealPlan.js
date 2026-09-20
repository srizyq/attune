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
export const LIMITS = { items: 20, name: 120, label: 60, calories: 5000, macro: 1000, planName: 80, notes: 2000 };
const NUMERIC = ['calories', 'protein_g', 'carbs_g', 'fat_g'];

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
    source: 'plan',
  };
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
