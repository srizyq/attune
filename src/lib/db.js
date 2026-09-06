import { supabase } from './supabase';

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

export async function getFoodLogsForRange(userId, startDate, endDate) {
  const { data, error } = await supabase
    .from('food_logs')
    .select('*')
    .eq('user_id', userId)
    .gte('logged_date', startDate)
    .lte('logged_date', endDate)
    .order('logged_date', { ascending: true });
  if (error) throw error;
  return data;
}

export async function addFoodLog(userId, entry) {
  const { data, error } = await supabase
    .from('food_logs')
    .insert({
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
      serving_grams: entry.servingGrams || null,
      logged_at: entry.loggedAt ? entry.loggedAt.toISOString() : null,
      source: entry.source || 'local',
      logged_amount: entry.loggedAmount ?? null,
      logged_unit: entry.loggedUnit ?? null,
    })
    .select()
    .single();
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
    serving_grams: entry.servingGrams || null,
  };
  // Both optional — only touched when the caller actually included them,
  // so an amount-only edit never accidentally resets the other. Lets an
  // already-logged item move to a different meal (free tier) or a
  // different logged time (Pro), instead of requiring delete + re-add.
  if (entry.meal !== undefined) patch.meal = entry.meal;
  if (entry.loggedAt !== undefined) patch.logged_at = entry.loggedAt ? entry.loggedAt.toISOString() : null;
  const { data, error } = await supabase
    .from('food_logs')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
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
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .gte('checkin_date', startDate)
    .lte('checkin_date', endDate)
    .order('checkin_date', { ascending: true });
  if (error) throw error;
  return data;
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

export async function addSavedMeal(userId, name, items) {
  const { data, error } = await supabase
    .from('saved_meals')
    .insert({ user_id: userId, name, items })
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
  const { data, error } = await supabase
    .from('favourite_foods')
    .upsert({
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
    }, { onConflict: 'user_id,name' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeFavouriteFoodByName(userId, name) {
  const { error } = await supabase.from('favourite_foods').delete().eq('user_id', userId).eq('name', name);
  if (error) throw error;
}

// ─── weight_logs ────────────────────────────────────────────────────────────

export async function getWeightLogsForRange(userId, startDate, endDate) {
  let query = supabase
    .from('weight_logs')
    .select('*')
    .eq('user_id', userId)
    .order('logged_date', { ascending: true });
  if (startDate) query = query.gte('logged_date', startDate);
  if (endDate) query = query.lte('logged_date', endDate);
  const { data, error } = await query;
  if (error) throw error;
  return data;
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

// ─── afcd_foods (Australian Food Composition Database, read-only) ──────────
// AFCD names are written adjective-first ("Pie, savoury, meat, commercial"),
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

export async function searchAfcdFoods(query, limit = 15) {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  let q = supabase.from('afcd_foods').select('*');
  for (const word of words) {
    q = q.filter('name', 'imatch', wordBoundaryPattern(word));
  }
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  // Exact substring matching doesn't tolerate typos ("chiken" won't find
  // "chicken") — only fall back to Postgres trigram similarity search
  // when the strict match comes up completely empty, so a real exact hit
  // is never displaced by a fuzzier, less certain one.
  if (data.length > 0) return data;
  const { data: fuzzyData, error: fuzzyError } = await supabase
    .rpc('search_afcd_foods_fuzzy', { search_query: query.trim(), match_limit: limit });
  if (fuzzyError) throw fuzzyError;
  return fuzzyData;
}

// ─── trainer_clients ────────────────────────────────────────────────────────

export async function getMyClients(trainerId) {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select('id, status, created_at, client:profiles!trainer_clients_client_id_fkey(id, name, goal, calorie_target, protein_g, carbs_g, fat_g, unit)')
    .eq('trainer_id', trainerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyTrainers(clientId) {
  const { data, error } = await supabase
    .from('trainer_clients')
    .select('id, status, created_at, trainer:profiles!trainer_clients_trainer_id_fkey(id, name)')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
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

export async function addTrainerComment(trainerId, clientId, body, commentDate = null) {
  const { data, error } = await supabase
    .from('trainer_comments')
    .insert({ trainer_id: trainerId, client_id: clientId, body, comment_date: commentDate })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTrainerComment(id) {
  const { error } = await supabase.from('trainer_comments').delete().eq('id', id);
  if (error) throw error;
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
