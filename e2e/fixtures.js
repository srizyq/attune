// Deterministic fake account data for the layout checks. Dates are relative
// to "today" so the app's date logic (week strip, streaks, trends) always has
// realistic recent history; values come from a seeded generator so screenshots
// are stable run to run.

export const USER_ID = '00000000-0000-4000-8000-00000000d3m0';

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
}

export function ymd(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function daysAgo(n) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return d; }

// name, kcal, protein, carbs, fat, servingGrams, unit, amount
const FOODS = {
  breakfast: [
    ['Greek yoghurt with honey and granola', 310, 22, 38, 8, 220, 'g', 220],
    ['Scrambled eggs on sourdough toast', 420, 24, 32, 21, 240, 'serving', 1],
    ['Banana', 105, 1.3, 27, 0.4, 118, 'serving', 1],
    ['Flat white (full cream milk)', 120, 6, 9, 6, 240, 'ml', 240],
  ],
  lunch: [
    ['Grilled chicken, avocado and quinoa power bowl with lemon tahini dressing (large)', 640, 46, 52, 26, 420, 'g', 420],
    ['Tuna salad sandwich', 380, 28, 36, 14, 210, 'serving', 1],
    ['Chicken caesar wrap', 510, 34, 41, 24, 260, 'serving', 1],
  ],
  dinner: [
    ['Salmon fillet with roasted vegetables', 560, 42, 24, 32, 380, 'g', 380],
    ['Beef stir fry with jasmine rice', 690, 38, 74, 22, 450, 'g', 450],
    ['Vegetable curry with basmati rice', 610, 16, 92, 18, 480, 'g', 480],
  ],
  snacks: [
    ['Protein bar (Dubai chocolate)', 210, 20, 18, 8, 55, 'serving', 1],
    ['Almonds', 170, 6, 6, 15, 30, 'g', 30],
    ['Apple', 95, 0.5, 25, 0.3, 182, 'serving', 1],
  ],
};
const MEAL_HOUR = { breakfast: 8, lunch: 12, dinner: 19, snacks: 15 };

function foodRow(id, when, meal, [name, cal, p, c, f, grams, unit, amount], r) {
  const at = new Date(when); at.setHours(MEAL_HOUR[meal], Math.floor(r() * 50), 0, 0);
  return {
    id, user_id: USER_ID, logged_date: ymd(when), meal, food_name: name, calories: cal,
    protein_g: p, carbs_g: c, fat_g: f, fibre_g: +(r() * 6).toFixed(1), sodium_mg: Math.round(r() * 700),
    sugar_g: +(r() * 18).toFixed(1), saturated_fat_g: +(r() * 8).toFixed(1), trans_fat_g: 0, cholesterol_mg: Math.round(r() * 120),
    potassium_mg: Math.round(200 + r() * 500), added_sugar_g: +(r() * 6).toFixed(1), vitamin_d_mcg: +(r() * 4).toFixed(1),
    calcium_mg: Math.round(r() * 250), iron_mg: +(r() * 5).toFixed(1), vitamin_a_mcg: Math.round(r() * 300),
    vitamin_c_mg: +(r() * 40).toFixed(1), polyunsaturated_fat_g: +(r() * 4).toFixed(1), monounsaturated_fat_g: +(r() * 6).toFixed(1),
    magnesium_mg: Math.round(r() * 90), zinc_mg: +(r() * 4).toFixed(1), vitamin_b12_mcg: +(r() * 2).toFixed(1), folate_mcg: Math.round(r() * 120),
    serving_grams: grams, logged_at: at.toISOString(), source: 'search', logged_amount: amount, logged_unit: unit,
    serving_label: null, created_at: at.toISOString(),
  };
}

export function buildFoodLogs() {
  const r = rng(42);
  const rows = [];
  let id = 1;
  for (let n = 0; n < 90; n++) {
    if (n % 11 === 7) continue; // a few un-logged days
    const when = daysAgo(n);
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snacks']) {
      // Today: leave breakfast and dinner empty so the empty-meal states show.
      if (n === 0 && (meal === 'breakfast' || meal === 'dinner')) continue;
      const list = FOODS[meal];
      const count = meal === 'snacks' ? 1 + Math.floor(r() * 2) : 1 + (r() > 0.7 ? 1 : 0);
      for (let k = 0; k < count; k++) rows.push(foodRow(`fl-${id++}`, when, meal, list[Math.floor(r() * list.length)], r));
    }
  }
  return rows;
}

export function buildProfile(overrides = {}) {
  return {
    id: USER_ID, name: 'Alex Morgan', goal: 'lose', age: 29, date_of_birth: '1997-03-14', sex: 'male', weight: 82, target_weight: 76,
    height: 178, unit: 'metric', activity: 'moderate', pace_kg_per_week: 0.5, calorie_target: 2100, protein_g: 150, carbs_g: 210, fat_g: 70,
    calorie_mode: 'calculated', water_target: 8, onboarding_completed: true, is_premium: true, coach_pass: false, coach_mode: false,
    coach_invite_code: null, theme: 'dark', reminder_enabled: false, reminder_time: '18:00', reminder_timezone: 'Australia/Sydney',
    photo_scans_used: 3, photo_scans_period_start: ymd(daysAgo(5)), menu_scans_used: 1, menu_scans_period_start: ymd(daysAgo(5)),
    micro_targets: null, daily_log_view: 'hourly', trial_ends_at: null, pro_status: 'active',
    stripe_customer_id: 'cus_fake', stripe_pro_subscription_id: 'sub_fake', notify_trainer_comments: false, notify_client_activity: false,
    created_at: daysAgo(120).toISOString(), updated_at: new Date().toISOString(), ...overrides,
  };
}

export function buildWeightLogs() {
  const rows = [];
  for (let n = 0; n < 60; n += 2) rows.push({ id: `w-${n}`, user_id: USER_ID, logged_date: ymd(daysAgo(n)), weight: +(82 + n * 0.05 - Math.sin(n / 4) * 0.4).toFixed(1), unit: 'kg', created_at: daysAgo(n).toISOString() });
  return rows;
}

export function buildWorkouts() {
  return [2, 4, 5, 9].map((n, i) => ({ id: `wo-${i}`, user_id: USER_ID, logged_date: ymd(daysAgo(n)), type: ['Running', 'Weights', 'Cycling', 'Swimming'][i], intensity: 'moderate', duration_minutes: 30 + i * 10, calories_burned: 250 + i * 60, created_at: daysAgo(n).toISOString() }));
}

export function buildCheckins() {
  const rows = [];
  for (let n = 0; n < 30; n++) rows.push({ id: `c-${n}`, user_id: USER_ID, mood: 3 + (n % 3), energy: 5 + (n % 5), water_glasses: 4 + (n % 5), note: null, created_at: daysAgo(n).toISOString() });
  return rows;
}

const food = (i, name, cal, p, c, f) => ({ id: `cf-${i}`, user_id: USER_ID, name, brand: i % 2 ? 'Homemade' : null, serving_label: '1 serving', serving_grams: 150, calories: cal, protein_g: p, carbs_g: c, fat_g: f, fibre_g: 3, sodium_mg: 200, sugar_g: 5, created_at: daysAgo(i).toISOString() });
export const CUSTOM_FOODS = [food(1, 'Mum\'s lasagne', 480, 28, 42, 22), food(2, 'Overnight oats', 350, 14, 52, 9), food(3, 'Post-workout shake', 260, 35, 18, 4)];
export const FAVOURITES = [food(1, 'Chobani Greek yoghurt', 120, 12, 9, 4), food(2, 'Sourdough toast', 130, 4, 24, 1), food(3, 'Avocado', 240, 3, 13, 22), food(4, 'Chicken breast', 165, 31, 0, 3.6)];
export const SAVED_MEALS = [
  { id: 'sm-1', user_id: USER_ID, name: 'Big breakfast', servings: 1, created_at: daysAgo(3).toISOString(), items: [{ name: 'Eggs', cal: 140, protein: 12, carbs: 1, fat: 10, servingGrams: 100, loggedAmount: 2, loggedUnit: 'serving' }, { name: 'Sourdough toast', cal: 130, protein: 4, carbs: 24, fat: 1, servingGrams: 45, loggedAmount: 1, loggedUnit: 'serving' }] },
  { id: 'sm-2', user_id: USER_ID, name: 'Chicken and rice', servings: 2, created_at: daysAgo(9).toISOString(), items: [{ name: 'Chicken breast', cal: 330, protein: 62, carbs: 0, fat: 7, servingGrams: 200, loggedAmount: 200, loggedUnit: 'g' }, { name: 'Jasmine rice', cal: 260, protein: 5, carbs: 57, fat: 0.5, servingGrams: 200, loggedAmount: 200, loggedUnit: 'g' }] },
];
