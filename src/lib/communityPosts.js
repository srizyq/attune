// Turning diary data into a Community post, and a post back into diary rows.
// Pure functions: nothing here talks to the database.
//
// A post's `payload` is a snapshot (the numbers can't be edited afterwards):
//   day:    { title, date, partial, goal_pct, calories, protein_g, carbs_g, fat_g, items:[…] }
//   meal:   { title, meal, date, calories, … , items:[…] }
//   recipe: { title, servings, calories, … (per serving), ingredients:[…] }
// where an item is { name, brand?, meal?, calories, protein_g, carbs_g, fat_g, fibre_g? }.

export const LOW_CALORIE_DAY = 1200;
export const MAX_ITEMS = 80;
const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snacks'];
const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

const r0 = (n) => Math.round(Number(n) || 0);
const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const clip = (s, n) => String(s || '').trim().slice(0, n);

const toItem = (i) => ({
  name: clip(i.name, 80) || 'Food',
  ...(i.brand ? { brand: clip(i.brand, 60) } : {}),
  ...(i.meal ? { meal: i.meal } : {}),
  calories: r0(i.cal ?? i.calories),
  protein_g: r1(i.protein ?? i.protein_g),
  carbs_g: r1(i.carbs ?? i.carbs_g),
  fat_g: r1(i.fat ?? i.fat_g),
  fibre_g: r1(i.fibre ?? i.fibre_g),
});

const totals = (items) => ({
  calories: r0(items.reduce((s, i) => s + i.calories, 0)),
  protein_g: r1(items.reduce((s, i) => s + i.protein_g, 0)),
  carbs_g: r1(items.reduce((s, i) => s + i.carbs_g, 0)),
  fat_g: r1(items.reduce((s, i) => s + i.fat_g, 0)),
});

const weekday = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', { weekday: 'long' });

/** A whole day. `items` are the diary items in the app's own shape. */
export function buildDayPost({ date, today, items, targetCalories }) {
  const list = (items || []).slice(0, MAX_ITEMS).map(toItem);
  const sum = totals(list);
  const isToday = date === today;
  return {
    kind: 'day',
    payload: {
      title: isToday ? 'Today so far' : weekday(date),
      date,
      partial: isToday,
      ...(targetCalories > 0 ? { goal_pct: Math.min(1000, r0((sum.calories / targetCalories) * 100)) } : {}),
      ...sum,
      items: list,
    },
  };
}

/** One meal. `meal` is 'breakfast' | 'lunch' | 'dinner' | 'snacks'. */
export function buildMealPost({ title, meal, date, items }) {
  const list = (items || []).slice(0, MAX_ITEMS).map(toItem);
  const fallback = list.length === 1 ? list[0].name : (MEAL_LABELS[meal] || 'Meal');
  return {
    kind: 'meal',
    payload: { title: clip(title, 80) || fallback, meal: MEAL_KEYS.includes(meal) ? meal : 'snacks', date, ...totals(list), items: list },
  };
}

/** A saved recipe (a saved_meals row: { name, items, servings }), per-serving numbers on top. */
export function buildRecipePost(recipe) {
  const servings = Number(recipe?.servings) > 0 ? Number(recipe.servings) : 1;
  const ingredients = (recipe?.items || []).slice(0, 60).map((i) => ({
    ...toItem(i),
    ...(i.servingGrams ? { grams: r0(i.servingGrams) } : {}),
  }));
  const whole = totals(ingredients);
  return {
    kind: 'recipe',
    payload: {
      title: clip(recipe?.name, 80) || 'Recipe',
      servings,
      calories: r0(whole.calories / servings),
      protein_g: r1(whole.protein_g / servings),
      carbs_g: r1(whole.carbs_g / servings),
      fat_g: r1(whole.fat_g / servings),
      ingredients,
    },
  };
}

/** Can this recipe be shared? A recipe with no ingredients has nothing to copy. */
export const canShareRecipe = (recipe) => (recipe?.items || []).length > 0;

/** A day under the floor gets a gentle check-in before it's posted (it can still be posted). */
export function needsLowCalorieCheck(kind, payload) {
  return kind === 'day' && !payload?.partial && Number(payload?.calories) > 0 && Number(payload.calories) < LOW_CALORIE_DAY;
}

const rowFor = (userId, item, { meal, date, scale = 1, loggedAt }) => ({
  user_id: userId,
  logged_date: date,
  meal: MEAL_KEYS.includes(meal) ? meal : MEAL_KEYS.includes(item.meal) ? item.meal : 'snacks',
  food_name: item.name,
  brand: item.brand || null,
  calories: r0(item.calories * scale),
  protein_g: r1(item.protein_g * scale),
  carbs_g: r1(item.carbs_g * scale),
  fat_g: r1(item.fat_g * scale),
  fibre_g: r1((item.fibre_g || 0) * scale),
  logged_at: loggedAt || null,
  source: 'community',
});

/**
 * The diary rows a "Copy to my log" adds. A day copies every item into the
 * meal it was eaten in (or all into `meal` if one is given); a meal copies
 * into the chosen meal; a recipe adds `servings` servings as one entry.
 */
export function postToLogRows(post, userId, { meal, date, servings = 1, loggedAt } = {}) {
  const p = post.payload;
  if (post.kind === 'recipe') {
    const n = Number(servings) > 0 ? Number(servings) : 1;
    return [rowFor(userId, { name: p.title, calories: p.calories, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g }, { meal, date, scale: n, loggedAt })];
  }
  const items = (p.items && p.items.length)
    ? p.items
    : [{ name: p.title, calories: p.calories, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g }];
  return items.map((item) => rowFor(userId, item, { meal: post.kind === 'day' ? meal || undefined : meal, date, loggedAt }));
}

/** A recipe post as a saved_meals row for the person copying it. */
export function recipePostToSavedMeal(post, userId) {
  const p = post.payload;
  return {
    user_id: userId,
    name: p.title,
    servings: Number(p.servings) > 0 ? Number(p.servings) : 1,
    items: (p.ingredients || []).map((i) => ({
      name: i.name,
      cal: i.calories,
      protein: i.protein_g,
      carbs: i.carbs_g,
      fat: i.fat_g,
      fibre: i.fibre_g || 0,
      servingGrams: i.grams ?? null,
    })),
  };
}

export const mealLabel = (key) => MEAL_LABELS[key] || '';

/** "2h", "3d", "Just now" — how long ago, kept short for a post header. */
export function timeAgo(iso, now = Date.now()) {
  const secs = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (secs < 60) return 'Just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

/** 'MK' from a display name (or username) for the avatar circle. */
export function initialsOf(name) {
  const letters = String(name || '').trim().split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return letters || '?';
}
