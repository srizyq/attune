import { supabase } from './supabase';
import { shiftIsoDateKeepLocalTime } from './mealTime';
import { isMissingFunctionError } from './coachInvite';
import { selectAll } from './paging';
import { isMissingColumnError } from './dbErrors';
import { extendedToRow, lateFavouriteToRow } from './microNutrients';

// ─── profiles ──────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertProfile(userId, fields) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...fields, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── food_logs ─────────────────────────────────────────────────────────────

export async function getFoodLogsForDate(userId, date) {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('logged_date', date)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Paged: a plain select caps at 1,000 rows without saying so, which a heavy
// logger over 90+ days exceeds — the newest days would silently go missing
// from every chart and average built on this. The extra ordering columns make
// page boundaries deterministic.
export async function getFoodLogsForRange(userId, startDate, endDate) {
  return selectAll(() => supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_date', startDate)
    .lte('logged_date', endDate)
    .order('logged_date', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
}

export async function addFoodLog(userId, entry) {
  const row = {
      user_id: userId,
      logged_date: entry.loggedDate,
      meal: entry.meal,
      food_name: entry.name,
      calories: entry.cal || 0,
      protein_g: entry.protein || 0,
      carbs_g: entry.carbs || 0,
      fat_g: entry.fat || 0,
      fibre_g: entry.fibre || 0,
      sodium_mg: entry.sodium || 0,
      sugar_g: entry.sugar || 0,
      saturated_fat_g: entry.saturatedFat || 0,
      trans_fat_g: entry.transFat || 0,
      cholesterol_mg: entry.cholesterol || 0,
      potassium_mg: entry.potassium || 0,
      added_sugar_g: entry.addedSugar || 0,
      vitamin_d_mcg: entry.vitaminD || 0,
      calcium_mg: entry.calcium || 0,
      iron_mg: entry.iron || 0,
      vitamin_a_mcg: entry.vitaminA || 0,
      vitamin_c_mg: entry.vitaminC || 0,
      polyunsaturated_fat_g: entry.polyunsaturatedFat || 0,
      monounsaturated_fat_g: entry.monounsaturatedFat || 0,
      magnesium_mg: entry.magnesium || 0,
      zinc_mg: entry.zinc || 0,
      vitamin_b12_mcg: entry.vitaminB12 || 0,
      folate_mcg: entry.folate || 0,
      serving_grams: entry.servingGrams || null,
      logged_at: entry.loggedAt ? entry.loggedAt.toISOString() : null,
      source: entry.source || 'local',
      logged_amount: entry.loggedAmount ?? null,
      logged_unit: entry.loggedUnit ?? null,
      serving_label: entry.servingLabel ?? null,
  };
  // The extended nutrients (B vitamins, selenium, ...) only go in when the food
  // actually carries them. If the database hasn't had its update yet, retry
  // without them so logging food never breaks over a nutrient column.
  const extended = extendedToRow(entry);
  const insert = (r) => supabase.from('food_logs').insert(r).select().single();
  let { data, error } = await insert({ ...row, ...extended });
  if (error && Object.keys(extended).length > 0 && isMissingColumnError(error)) ({ data, error } = await insert(row));
  if (error) throw error;
  return data;
}

// Re-inserts a set of already-fetched food_logs rows (raw Supabase rows,
// e.g. from getFoodLogsForDate — same snake_case shape, so callers can
// pass them straight through without re-mapping) onto a different day, for
// the "copy meals from another day" feature. A real array insert, unlike
// every other write in this file — those are all one row at a time because
// they're each reacting to a single user action, but re-doing that in a
// loop here would be N round-trips for one "copy" tap.
// id/created_at are dropped so Postgres generates fresh ones; logged_at is
// re-dated onto destDate but keeps its local time-of-day (see
// shiftIsoDateKeepLocalTime) so a copied 8am item still shows at 8am on
// Pro's hourly log, not at whatever moment the copy happened to run.
export async function copyFoodLogs(userId, sourceRows, destDate) {
  if (!sourceRows.length) return [];
  const rows = sourceRows.map(row => {
    const copy = { ...row };
    delete copy.id;
    delete copy.created_at;
    copy.user_id = userId;
    copy.logged_date = destDate;
    copy.logged_at = row.logged_at ? shiftIsoDateKeepLocalTime(row.logged_at, destDate) : null;
    return copy;
  });
  const { data, error } = await supabase.from('food_logs').insert(rows).select();
  if (error) throw error;
  return data;
}

export async function deleteFoodLog(id) {
  const { error } = await supabase.from('food_logs').delete().eq('id', id);
  if (error) throw error;
}

export async function updateFoodLog(id, entry) {
  const patch = {
    calories: entry.cal || 0,
    protein_g: entry.protein || 0,
    carbs_g: entry.carbs || 0,
    fat_g: entry.fat || 0,
    fibre_g: entry.fibre || 0,
    sodium_mg: entry.sodium || 0,
    sugar_g: entry.sugar || 0,
    saturated_fat_g: entry.saturatedFat || 0,
    trans_fat_g: entry.transFat || 0,
    cholesterol_mg: entry.cholesterol || 0,
    potassium_mg: entry.potassium || 0,
    added_sugar_g: entry.addedSugar || 0,
    vitamin_d_mcg: entry.vitaminD || 0,
    calcium_mg: entry.calcium || 0,
    iron_mg: entry.iron || 0,
    vitamin_a_mcg: entry.vitaminA || 0,
    vitamin_c_mg: entry.vitaminC || 0,
    polyunsaturated_fat_g: entry.polyunsaturatedFat || 0,
    monounsaturated_fat_g: entry.monounsaturatedFat || 0,
    magnesium_mg: entry.magnesium || 0,
    zinc_mg: entry.zinc || 0,
    vitamin_b12_mcg: entry.vitaminB12 || 0,
    folate_mcg: entry.folate || 0,
    serving_grams: entry.servingGrams || null,
  };
  // All optional — only touched when the caller actually included them, so
  // an amount-only edit never accidentally resets the others. Lets an
  // already-logged item move to a different meal (free tier) or a
  // different logged time (Pro), instead of requiring delete + re-add.
  if (entry.meal !== undefined) patch.meal = entry.meal;
  if (entry.loggedAt !== undefined) patch.logged_at = entry.loggedAt ? entry.loggedAt.toISOString() : null;
  // logged_amount/logged_unit weren't in here at all until now — every
  // other field this function patches was kept in sync on edit, but these
  // two (which Recent/Frequent's row subtitle and quick-re-add prefill
  // read directly off the row, see recentRowMeta in FoodSearch.jsx) stayed
  // frozen at whatever was first logged, so editing an item's amount left
  // its macros and its displayed portion disagreeing from then on.
  if (entry.loggedAmount !== undefined) patch.logged_amount = entry.loggedAmount;
  if (entry.loggedUnit !== undefined) patch.logged_unit = entry.loggedUnit;
  // Extended nutrients: only touched when the entry has a value, so an edit can
  // never overwrite an unknown with a made-up zero (and never trips on a
  // database that hasn't had its update yet, unless real data needs saving).
  const extended = extendedToRow(entry);
  const update = (p) => supabase.from('food_logs').update(p).eq('id', id).select().single();
  let { data, error } = await update({ ...patch, ...extended });
  if (error && Object.keys(extended).length > 0 && isMissingColumnError(error)) ({ data, error } = await update(patch));
  if (error) throw error;
  return data;
}

export async function getRecentFoodLogs(userId, limit = 40) {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

// ─── workout_logs ──────────────────────────────────────────────────────────

export async function getWorkoutLogsForRange(userId, startDate, endDate) {
  return selectAll(() => supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_date', startDate)
    .lte('logged_date', endDate)
    .order('logged_date', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true }));
}

export async function getWorkoutLogsForDate(userId, date) {
  const { data, error } = await supabase
    .from('workout_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('logged_date', date)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addWorkoutLog(userId, entry) {
  const { data, error } = await supabase
    .from('workout_logs')
    .insert({
      user_id: userId,
      logged_date: entry.loggedDate,
      type: entry.type,
      intensity: entry.intensity,
      duration_minutes: entry.durationMinutes,
      calories_burned: entry.caloriesBurned || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWorkoutLog(id) {
  const { error } = await supabase.from('workout_logs').delete().eq('id', id);
  if (error) throw error;
}

// ─── checkins ──────────────────────────────────────────────────────────────

export async function getCheckinForDate(userId, date) {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('checkin_date', date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCheckinsForRange(userId, startDate, endDate) {
  return selectAll(() => supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('checkin_date', startDate)
    .lte('checkin_date', endDate)
    .order('checkin_date', { ascending: true })
    .order('id', { ascending: true }));
}

export async function upsertCheckin(userId, date, fields) {
  const { data, error } = await supabase
    .from('checkins')
    .upsert(
      { user_id: userId, checkin_date: date, ...fields },
      { onConflict: 'user_id,checkin_date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── custom_foods ──────────────────────────────────────────────────────────

export async function getCustomFoods(userId) {
  const { data, error } = await supabase
    .from('custom_foods')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addCustomFood(userId, food) {
  const { data, error } = await supabase
    .from('custom_foods')
    .insert({
      user_id: userId,
      name: food.name,
      brand: food.brand || null,
      serving_label: food.servingLabel || '1 serving',
      serving_grams: food.servingGrams || null,
      calories: food.cal || 0,
      protein_g: food.protein || 0,
      carbs_g: food.carbs || 0,
      fat_g: food.fat || 0,
      fibre_g: food.fibre || 0,
      sodium_mg: food.sodium || 0,
      sugar_g: food.sugar || 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCustomFood(id) {
  const { error } = await supabase.from('custom_foods').delete().eq('id', id);
  if (error) throw error;
}

// ─── saved_meals ───────────────────────────────────────────────────────────

export async function getSavedMeals(userId) {
  const { data, error } = await supabase
    .from('saved_meals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addSavedMeal(userId, name, items, servings = 1) {
  const { data, error } = await supabase
    .from('saved_meals')
    .insert({ user_id: userId, name, items, servings })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateSavedMeal(id, { name, items, servings }) {
  const { data, error } = await supabase
    .from('saved_meals')
    .update({ name, items, servings })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSavedMeal(id) {
  const { error } = await supabase.from('saved_meals').delete().eq('id', id);
  if (error) throw error;
}

// ─── favourite_foods ───────────────────────────────────────────────────────

export async function getFavouriteFoods(userId) {
  const { data, error } = await supabase
    .from('favourite_foods')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFavouriteFood(userId, food) {
  const row = {
      user_id: userId,
      name: food.name,
      brand: food.brand || null,
      serving_label: food.meta || '1 serving',
      serving_grams: food.servingGrams || null,
      calories: food.cal || 0,
      protein_g: food.protein || 0,
      carbs_g: food.carbs || 0,
      fat_g: food.fat || 0,
      fibre_g: food.fibre || 0,
      sodium_mg: food.sodium || 0,
      sugar_g: food.sugar || 0,
      saturated_fat_g: food.saturatedFat || 0,
      trans_fat_g: food.transFat || 0,
      cholesterol_mg: food.cholesterol || 0,
      potassium_mg: food.potassium || 0,
      added_sugar_g: food.addedSugar || 0,
      vitamin_d_mcg: food.vitaminD || 0,
      calcium_mg: food.calcium || 0,
      iron_mg: food.iron || 0,
      source: food.source || null,
  };
  // Vitamins, minerals and the extended nutrients go in only when the food has
  // them; if the database hasn't had the update that adds those columns, retry
  // without them so starring a food never fails over a nutrient column.
  const late = lateFavouriteToRow(food);
  const upsert = (r) => supabase.from('favourite_foods').upsert(r, { onConflict: 'user_id,name' }).select().single();
  let { data, error } = await upsert({ ...row, ...late });
  if (error && Object.keys(late).length > 0 && isMissingColumnError(error)) ({ data, error } = await upsert(row));
  if (error) throw error;
  return data;
}

export async function removeFavouriteFoodByName(userId, name) {
  const { error } = await supabase.from('favourite_foods').delete().eq('user_id', userId).eq('name', name);
  if (error) throw error;
}

// ─── weight_logs ────────────────────────────────────────────────────────────

// One row per day, but "All time" over 5+ years passes the 1,000-row cap.
export async function getWeightLogsForRange(userId, startDate, endDate) {
  return selectAll(() => {
    let query = supabase
      .from('weight_logs')
      .select('*')
      .eq('user_id', userId)
      .order('logged_date', { ascending: true })
      .order('id', { ascending: true });
    if (startDate) query = query.gte('logged_date', startDate);
    if (endDate) query = query.lte('logged_date', endDate);
    return query;
  });
}

export async function getLatestWeightLog(userId) {
  const { data, error } = await supabase
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertWeightLog(userId, date, weight, unit) {
  const { data, error } = await supabase
    .from('weight_logs')
    .upsert(
      { user_id: userId, logged_date: date, weight, unit },
      { onConflict: 'user_id,logged_date' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── barcode_products (shared community table) ─────────────────────────────
export async function getBarcodeProduct(barcode) {
  const { data, error } = await supabase
    .from('barcode_products')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Barcode is the primary key, so a duplicate submission for one someone
// else already added just fails the insert — the caller falls back to
// using whatever's already there rather than treating that as a real
// error (see lookupBarcode's shared-table branch in FoodSearch.jsx).
export async function addBarcodeProduct(userId, barcode, fields) {
  const { data, error } = await supabase
    .from('barcode_products')
    .insert({ barcode, created_by: userId, ...fields })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── ausnut_foods (AUSNUT 2023, read-only — see supabase/schema.sql for the
// afcd_foods -> ausnut_foods migration history) ─────────────────────────────
// AUSNUT names are written adjective-first ("Pie, savoury, meat, commercial"),
// not in the word order someone actually types ("meat pie") — a single
// substring match against the whole query would miss that entirely. Each
// word gets its own filter instead, ANDed together by Supabase/PostgREST,
// so a match just needs every word present somewhere in the name, in any
// order.
//
// Each word matches at a word boundary (Postgres's `\m` = start-of-word),
// not a bare substring — a plain "%dal%" matched "medallion" and "Pork,
// medallion or loin steak" for a search like "dal" (a real, short
// vegetarian dish name), which is exactly the kind of noise this avoids.
// Anchoring only the start (not requiring `\M` at the end too) still lets
// a prefix like "chick" find "chicken"/"chickpea".
function wordBoundaryPattern(word) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return `\\m${escaped}`;
}

export async function searchAusnutFoods(query, limit = 15) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // Server-side ordering (shortest name first — see search_ausnut_foods_ranked's
  // comment in schema.sql) rather than a plain filter-and-LIMIT: AUSNUT's
  // ~3,700 foods routinely have more matches for a common ingredient than
  // `limit` (e.g. 18 for "chicken breast", 98 for "rice"), and an unordered
  // LIMIT can return a run of composite items ("Chicken burger, chicken
  // breast, with salad, fast food chain") before ever reaching the plain
  // "Chicken, breast, lean, raw" entry — silently dropping the best match
  // rather than just ranking it lower.
  const { data, error } = await supabase.rpc('search_ausnut_foods_ranked', {
    patterns: words.map(wordBoundaryPattern),
    match_limit: limit,
  });
  if (error) throw error;
  // Exact substring matching doesn't tolerate typos ("chiken" won't find
  // "chicken") — only fall back to Postgres trigram similarity search
  // when the strict match comes up completely empty, so a real exact hit
  // is never displaced by a fuzzier, less certain one.
  if (data.length > 0) return data;
  const { data: fuzzyData, error: fuzzyError } = await supabase
    .rpc('search_ausnut_foods_fuzzy', { search_query: query.trim(), match_limit: limit });
  if (fuzzyError) throw fuzzyError;
  return fuzzyData;
}

// ─── common_dishes (seeded AI-estimate cache for composite/prepared dishes
// AUSNUT covers poorly — curries, pad thai, meat pies, etc.) ────────────────
// Same word-boundary-ANDed / fuzzy-fallback shape as searchAusnutFoods above
// — see scripts/seed-common-dishes/ for how this table gets populated.
export async function searchCommonDishes(query, limit = 8) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  let q = supabase.from('common_dishes').select('*');
  for (const word of words) {
    q = q.filter('name', 'imatch', wordBoundaryPattern(word));
  }
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  if (data.length > 0) return data;
  const { data: fuzzyData, error: fuzzyError } = await supabase
    .rpc('search_common_dishes_fuzzy', { search_query: query.trim(), match_limit: limit });
  if (fuzzyError) throw fuzzyError;
  return fuzzyData;
}

// ─── trainer_clients ────────────────────────────────────────────────────────

export async function getMyClients(trainerId) {
  const clients = (columns) => supabase
    .from('trainer_clients')
    .select(`id, status, created_at, group_label, client:profiles!trainer_clients_client_id_fkey(${columns})`)
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  const base = 'id, name, goal, calorie_target, protein_g, carbs_g, fat_g, unit, micro_targets';
  let { data, error } = await clients(`${base}, rest_day_targets, training_days`);
  // The rest-day columns come from a later SQL update; until it's run, fall
  // back to the original columns so the client list keeps working.
  if (error && isMissingColumnError(error)) ({ data, error } = await clients(base));
  if (error) throw error;
  return data;
}

export async function setClientTargets(clientId, { calorie_target, protein_g, carbs_g, fat_g }) {
  const { error } = await supabase.rpc('set_client_targets', {
    p_client_id: clientId,
    p_calorie_target: calorie_target,
    p_protein_g: protein_g,
    p_carbs_g: carbs_g,
    p_fat_g: fat_g,
  });
  if (error) throw error;
}

// Replaces the client's rest-day targets and training weekdays (null / empty
// clears both). Validated server-side; see set_client_day_targets in schema.sql.
export async function setClientDayTargets(clientId, restDayTargets, trainingDays) {
  const { error } = await supabase.rpc('set_client_day_targets', {
    p_client_id: clientId,
    p_rest: restDayTargets,
    p_training_days: trainingDays,
  });
  if (error) {
    if (isMissingFunctionError(error)) throw new Error("Rest-day targets need the latest database update, which hasn't been applied yet.");
    throw error;
  }
}

// Replaces the client's whole per-nutrient target map (a missing nutrient =
// "use the default guideline"). Validated server-side; see
// set_client_micro_targets in schema.sql.
export async function setClientMicroTargets(clientId, targets) {
  const { error } = await supabase.rpc('set_client_micro_targets', { p_client_id: clientId, p_targets: targets });
  if (error) {
    if (isMissingFunctionError(error)) throw new Error('Nutrient targets need the latest database update, which hasn\'t been applied yet.');
    throw error;
  }
}

export async function setClientGroup(trainerClientRowId, groupLabel) {
  const { error } = await supabase
    .from('trainer_clients')
    .update({ group_label: groupLabel || null })
    .eq('id', trainerClientRowId);
  if (error) throw error;
}

export async function shareRecipeWithClient(clientId, name, items) {
  const { data, error } = await supabase.rpc('share_recipe_with_client', {
    p_client_id: clientId, p_name: name, p_items: items,
  });
  if (error) throw error;
  return data;
}

export async function uploadCoachLogo(userId, file) {
  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const path = `${userId}/logo.${ext}`;
  const { error: uploadError } = await supabase.storage.from('coach-logos').upload(path, file, { upsert: true });
  if (uploadError) throw uploadError;
  const { data } = supabase.storage.from('coach-logos').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`; // cache-bust so a re-upload shows immediately
}

// A client's linked coaches: pending invitations (awaiting the client's
// accept/decline) and active links. Each row keeps the shape the UI has
// always used — { id, status, created_at, consented_at, trainer: { id,
// name, coach_logo_url } }. consented_at null on an active link means it
// predates the consent step, which is what triggers the one-time notice.
export async function getMyTrainers(clientId) {
  const { data, error } = await supabase.rpc('get_my_coach_links');
  if (!error) {
    return (data || []).map((r) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      consented_at: r.consented_at,
      // Who suggested this coach (set when a coach brings in a teammate) — null otherwise.
      referredByName: r.referred_by_name ?? null,
      trainer: { id: r.trainer_id, name: r.trainer_name, coach_logo_url: r.trainer_logo_url },
    }));
  }
  if (!isMissingFunctionError(error)) throw error;
  // The app shipped before the consent migration was run: behave exactly as
  // before (active links only, no pending state, no consent notice).
  const { data: legacy, error: legacyError } = await supabase
    .from('trainer_clients')
    .select('id, status, created_at, trainer:profiles!trainer_clients_trainer_id_fkey(id, name, coach_logo_url)')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (legacyError) throw legacyError;
  return legacy.map((r) => ({ ...r, consented_at: r.created_at }));
}

export async function redeemCoachInviteCode(code) {
  const { data, error } = await supabase.rpc('redeem_coach_invite_code', { p_code: code });
  if (error) throw error;
  return data; // trainer_id
}

export async function revokeClientLink(trainerClientRowId) {
  const { error } = await supabase
    .from('trainer_clients')
    .update({ status: 'revoked' })
    .eq('id', trainerClientRowId);
  if (error) throw error;
}

// Accepting a pending invitation, or confirming the one-time notice on a
// connection that predates the consent step. Declining/disconnecting goes
// through respondToCoachLink(id, false) too.
export async function respondToCoachLink(linkId, accept) {
  const { error } = await supabase.rpc('respond_to_coach_link', { p_link_id: linkId, p_accept: accept });
  if (error) {
    if (isMissingFunctionError(error)) throw new Error('This needs the latest database update — try again shortly.');
    throw error;
  }
}

// ─── coach_invites (trainer side) ───────────────────────────────────────────

export async function getMyInvites(trainerId) {
  const { data, error } = await supabase
    .from('coach_invites')
    .select('id, code, label, expires_at, redeemed_at, revoked_at, created_at')
    .eq('trainer_id', trainerId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    // Table not created yet (migration not run): no invites, and the caller
    // falls back to the old shared-code flow.
    if (error.code === '42P01' || error.code === 'PGRST205') return null;
    throw error;
  }
  return data;
}

export async function createCoachInvite(label, days = 7) {
  const { data, error } = await supabase.rpc('create_coach_invite', { p_label: label || null, p_days: days });
  if (error) throw error;
  return data;
}

export async function revokeCoachInvite(inviteId) {
  const { error } = await supabase.rpc('revoke_coach_invite', { p_invite_id: inviteId });
  if (error) throw error;
}

// Clients who redeemed a code and haven't accepted yet — a first name and a
// date only; the trainer has no data access until the client says yes.
export async function getPendingClients() {
  const { data, error } = await supabase.rpc('get_pending_clients');
  if (error) {
    if (isMissingFunctionError(error)) return [];
    throw error;
  }
  return data || [];
}

// ─── trainer_comments ───────────────────────────────────────────────────────

export async function getTrainerComments(trainerId, clientId) {
  const { data, error } = await supabase
    .from('trainer_comments')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addTrainerComment(trainerId, clientId, body, commentDate = null, category = 'general') {
  const { data, error } = await supabase
    .from('trainer_comments')
    .insert({ trainer_id: trainerId, client_id: clientId, body, comment_date: commentDate, category })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrainerComment(id) {
  const { error } = await supabase.from('trainer_comments').delete().eq('id', id);
  if (error) throw error;
}

// Client-side read of their own most recent coach comment in a category —
// 'weight'/'general' just want the latest ever; 'nutrition' on Daily Log
// passes `date` to match that exact day's comment_date instead.
export async function getLatestCoachComment(clientId, category, date = null) {
  let query = supabase
    .from('trainer_comments')
    .select('id, body, created_at, comment_date, trainer_id, trainer:profiles!trainer_comments_trainer_id_fkey(name, coach_logo_url)')
    .eq('client_id', clientId)
    .eq('category', category)
    .order('created_at', { ascending: false })
    .limit(1);
  if (date) query = query.eq('comment_date', date);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

// The client's side of the two-way 'general' thread — full history, both
// directions, oldest first (a normal chat read order).
export async function getGeneralThread(clientId, trainerId) {
  const { data, error } = await supabase
    .from('trainer_comments')
    .select('id, body, sender_role, created_at')
    .eq('client_id', clientId)
    .eq('trainer_id', trainerId)
    .eq('category', 'general')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addClientReply(clientId, trainerId, body) {
  const { data, error } = await supabase
    .from('trainer_comments')
    .insert({ trainer_id: trainerId, client_id: clientId, body, category: 'general', sender_role: 'client' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── push_subscriptions ─────────────────────────────────────────────────────

export async function savePushSubscription(userId, subscription) {
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint: subscription.endpoint, subscription },
      { onConflict: 'endpoint' }
    );
  if (error) throw error;
}

export async function deletePushSubscriptionByEndpoint(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  if (error) throw error;
}

// ─── trainer-side: client summaries, private notes ─────────────────────────

// One row per active client with the numbers the client list is built from
// (see get_client_summaries in schema.sql). null means the function isn't
// there yet — the list then falls back to per-client history queries.
export async function getClientSummaries(todayIso) {
  const { data, error } = await supabase.rpc('get_client_summaries', { p_today: todayIso });
  if (error) {
    if (isMissingFunctionError(error)) return null;
    throw error;
  }
  return data || [];
}

const isMissingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205';

// Private notes a trainer keeps about a client. null = table not created yet.
export async function getTrainerNotes(trainerId, clientId) {
  const { data, error } = await supabase
    .from('trainer_notes')
    .select('id, body, note_date, pinned, created_at, updated_at')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data;
}

export async function addTrainerNote(trainerId, clientId, body, noteDate = null) {
  const { data, error } = await supabase
    .from('trainer_notes')
    .insert({ trainer_id: trainerId, client_id: clientId, body, note_date: noteDate })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTrainerNote(id, patch) {
  const { error } = await supabase.from('trainer_notes').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteTrainerNote(id) {
  const { error } = await supabase.from('trainer_notes').delete().eq('id', id);
  if (error) throw error;
}

// ─── body measurements + progress photos ────────────────────────────────────

// null = the table isn't there yet (database update not applied).
export async function getBodyMeasurements(userId, sinceDate = null) {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('id, logged_date, kind, value, unit')
    .eq('user_id', userId)
    .gte('logged_date', sinceDate || '1970-01-01')
    .order('logged_date', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data;
}

// One value per kind per day — logging again the same day replaces it.
export async function upsertBodyMeasurement(userId, { date, kind, value, unit }) {
  const { error } = await supabase
    .from('body_measurements')
    .upsert({ user_id: userId, logged_date: date, kind, value, unit }, { onConflict: 'user_id,logged_date,kind' });
  if (error) throw error;
}

export async function deleteBodyMeasurement(id) {
  const { error } = await supabase.from('body_measurements').delete().eq('id', id);
  if (error) throw error;
}

export async function getProgressPhotos(userId) {
  const { data, error } = await supabase
    .from('progress_photos')
    .select('id, taken_date, path, note, created_at')
    .eq('user_id', userId)
    .order('taken_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data;
}

const PHOTO_BUCKET = 'progress-photos';

// Upload first, then the row; if the row fails, take the file back out so a
// failed save can't leave an orphaned photo behind.
export async function uploadProgressPhoto(userId, blob, takenDate, note = null) {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) throw uploadError;
  const { error: rowError } = await supabase.from('progress_photos').insert({ user_id: userId, taken_date: takenDate, path, note });
  if (rowError) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path]);
    throw rowError;
  }
  return path;
}

// File first, then the row: if removing the file fails we keep the row (the
// photo is still there and still listed) instead of orphaning the file.
export async function deleteProgressPhoto(photo) {
  const { error: removeError } = await supabase.storage.from(PHOTO_BUCKET).remove([photo.path]);
  if (removeError) throw removeError;
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id);
  if (error) throw error;
}

// Short-lived links: the bucket is private, and Supabase only signs a path
// the caller's storage policies let them read (the owner, or their active
// coach). Returns { [path]: url }.
export async function getSignedPhotoUrls(paths, expiresInSeconds = 3600) {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresInSeconds);
  if (error) throw error;
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}

// ─── weekly check-in forms ──────────────────────────────────────────────────
// Each returns { supported: false } until the database update that creates the
// tables has been applied, so callers can hide the feature instead of failing.

export async function getCheckinForm(trainerId, clientId) {
  const { data, error } = await supabase
    .from('checkin_forms')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { supported: false, form: null };
    throw error;
  }
  return { supported: true, form: data };
}

// One form per coach/client pair, edited in place.
export async function saveCheckinForm(trainerId, clientId, { title, questions, cadenceDays, isActive }) {
  const { data, error } = await supabase
    .from('checkin_forms')
    .upsert(
      { trainer_id: trainerId, client_id: clientId, title, questions, cadence_days: cadenceDays, is_active: isActive },
      { onConflict: 'trainer_id,client_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCheckinForm(id) {
  const { error } = await supabase.from('checkin_forms').delete().eq('id', id);
  if (error) throw error;
}

// A client's recent submitted check-ins, newest first (a coach reads these).
export async function getCheckinResponses(clientId, limit = 12) {
  const { data, error } = await supabase
    .from('checkin_responses')
    .select('id, created_at, questions_snapshot, answers')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error)) return { supported: false, rows: [] };
    throw error;
  }
  return { supported: true, rows: data };
}

// The forms a coach has set for the signed-in client, each with when it was
// last answered.
export async function getMyCheckinForms() {
  const { data: forms, error } = await supabase
    .from('checkin_forms')
    .select('id, title, questions, cadence_days, is_active, created_at, trainer:profiles!checkin_forms_trainer_id_fkey(name)')
    .eq('is_active', true);
  if (error) {
    if (isMissingTable(error)) return { supported: false, forms: [] };
    throw error;
  }
  if (forms.length === 0) return { supported: true, forms: [] };
  const { data: responses, error: responseError } = await supabase
    .from('checkin_responses')
    .select('form_id, created_at')
    .in('form_id', forms.map((f) => f.id))
    .order('created_at', { ascending: false });
  if (responseError) throw responseError;
  const last = new Map();
  for (const r of responses) if (!last.has(r.form_id)) last.set(r.form_id, r.created_at);
  return { supported: true, forms: forms.map((f) => ({ ...f, last_response_at: last.get(f.id) || null })) };
}

// Only form_id and answers are sent — the database fills in the coach, the
// client and a snapshot of the questions, and validates the answers.
export async function submitCheckinResponse(formId, answers) {
  const { error } = await supabase.from('checkin_responses').insert({ form_id: formId, answers });
  if (error) throw error;
}

// ─── meal plans ─────────────────────────────────────────────────────────────

export async function getMealPlan(trainerId, clientId) {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { supported: false, plan: null };
    throw error;
  }
  return { supported: true, plan: data };
}

// One plan per coach/client pair, edited in place.
export async function saveMealPlan(trainerId, clientId, { name, notes, days, isActive }) {
  const { data, error } = await supabase
    .from('meal_plans')
    .upsert(
      { trainer_id: trainerId, client_id: clientId, name, notes: notes || null, days, is_active: isActive },
      { onConflict: 'trainer_id,client_id' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMealPlan(id) {
  const { error } = await supabase.from('meal_plans').delete().eq('id', id);
  if (error) throw error;
}

// The active plan(s) coaches have set for the signed-in client.
export async function getMyMealPlans() {
  const { data, error } = await supabase
    .from('meal_plans')
    .select('id, name, notes, days, updated_at, trainer:profiles!meal_plans_trainer_id_fkey(name)')
    .eq('is_active', true);
  if (error) {
    if (isMissingTable(error)) return { supported: false, plans: [] };
    throw error;
  }
  return { supported: true, plans: data };
}

// ─── coach teams ───────────────────────────────────────────────────────────

const TEAMS_MISSING = "Teams need the latest database update, which hasn't been applied yet.";

// The caller's team (see get_my_team in schema.sql) or null. `supported` is
// false until the SQL update is run, so the UI can simply hide.
export async function getMyTeam() {
  const { data, error } = await supabase.rpc('get_my_team');
  if (error) {
    if (isMissingFunctionError(error)) return { supported: false, team: null };
    throw error;
  }
  return { supported: true, team: data || null };
}

async function teamRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (isMissingFunctionError(error)) throw new Error(TEAMS_MISSING);
    throw error;
  }
  return data;
}

export const createCoachTeam = (name) => teamRpc('create_coach_team', { p_name: name });
export const createTeamInvite = (days = 7) => teamRpc('create_team_invite', { p_days: days });
export const revokeTeamInvite = (inviteId) => teamRpc('revoke_team_invite', { p_invite_id: inviteId });
export const redeemTeamInvite = (code) => teamRpc('redeem_team_invite', { p_code: code });
export const leaveCoachTeam = () => teamRpc('leave_coach_team', {});
export const removeTeamMember = (userId) => teamRpc('remove_team_member', { p_user_id: userId });
export const deleteCoachTeam = () => teamRpc('delete_coach_team', {});
export const shareClientWithTeammate = (clientId, teammateId) => teamRpc('share_client_with_teammate', { p_client_id: clientId, p_teammate_id: teammateId });

// The other coaches on one of your clients who are on your team.
export async function getClientCoaches(clientId) {
  const { data, error } = await supabase.rpc('get_client_coaches', { p_client_id: clientId });
  if (error) {
    if (isMissingFunctionError(error)) return { supported: false, coaches: [] };
    throw error;
  }
  return { supported: true, coaches: (data || []).map((r) => ({ id: r.trainer_id, name: r.trainer_name, status: r.status })) };
}

