import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addFoodLog, deleteFoodLog, updateFoodLog, moveFoodLogsToSlot, getFoodLogsForDate, getDaySlots, createDaySlot, updateDaySlot, deleteDaySlot } from '../lib/db';
import { mealFromDate } from '../lib/mealTime';
import { mapSlotRow, buildSlotTimeline } from '../lib/daySlots';
import { extendedFromRow, EXTENDED_KEYS } from '../lib/microNutrients';
import { buildFoodLogRow, buildFoodLogPatch } from '../lib/foodLogRows';
import { showAppToast } from '../lib/appToast';

export function mapRow(row) {
  return {
    id: row.id,
    name: row.food_name,
    brand: row.brand || null,
    meal: row.meal,
    loggedDate: row.logged_date || null,
    cal: Number(row.calories) || 0,
    protein: Number(row.protein_g) || 0,
    carbs: Number(row.carbs_g) || 0,
    fat: Number(row.fat_g) || 0,
    fibre: Number(row.fibre_g) || 0,
    sodium: Number(row.sodium_mg) || 0,
    sugar: Number(row.sugar_g) || 0,
    saturatedFat: Number(row.saturated_fat_g) || 0,
    transFat: Number(row.trans_fat_g) || 0,
    cholesterol: Number(row.cholesterol_mg) || 0,
    potassium: Number(row.potassium_mg) || 0,
    addedSugar: Number(row.added_sugar_g) || 0,
    vitaminD: Number(row.vitamin_d_mcg) || 0,
    calcium: Number(row.calcium_mg) || 0,
    iron: Number(row.iron_mg) || 0,
    vitaminA: Number(row.vitamin_a_mcg) || 0,
    vitaminC: Number(row.vitamin_c_mg) || 0,
    polyunsaturatedFat: Number(row.polyunsaturated_fat_g) || 0,
    monounsaturatedFat: Number(row.monounsaturated_fat_g) || 0,
    magnesium: Number(row.magnesium_mg) || 0,
    zinc: Number(row.zinc_mg) || 0,
    vitaminB12: Number(row.vitamin_b12_mcg) || 0,
    folate: Number(row.folate_mcg) || 0,
    ...extendedFromRow(row),
    servingGrams: row.serving_grams || null,
    loggedAmount: row.logged_amount != null ? Number(row.logged_amount) : null,
    loggedUnit: row.logged_unit || null,
    servingLabel: row.serving_label || null,
    source: row.source || null,
    loggedAt: row.logged_at || null,
    createdAt: row.created_at || null,
    slotId: row.slot_id || null,
    // What a photo-scanned meal was made of (null for everything else).
    ingredients: Array.isArray(row.ingredients) && row.ingredients.length ? row.ingredients : null,
  };
}

// The extended nutrients of a food, passed through as-is (null = unknown).
function extendedOf(food) {
  return Object.fromEntries(EXTENDED_KEYS.map((key) => [key, food[key] ?? null]));
}

// ─── Shared, cached days ─────────────────────────────────────────────────────
// Every screen that shows a day's food (Dashboard, Log, Food search, the scan
// pages) calls useFoodLogs(date) with its own instance. Each used to fetch from
// scratch on mount and wait for the server before showing anything, so every
// page change meant a spinner, and a food you had just logged was missing from
// the next page until it re-fetched. Now the days live in one store, keyed by
// user and date: an instance shows what the store already holds at once, then
// quietly refreshes it, and a change made in one instance reaches every other.
const MAX_CACHED_DAYS = 40;
const days = new Map(); // `${userId}:${date}` -> { logs: raw rows, slots: raw rows, version, loaded }
const listeners = new Set();

const dayKey = (userId, date) => `${userId}:${date}`;
const emptyDay = () => ({ logs: [], slots: [], version: 0, loaded: false });

function writeDay(key, patch, { mutation = false } = {}) {
  const prev = days.get(key) || emptyDay();
  days.delete(key); // re-insert so the Map stays ordered oldest-first by use
  days.set(key, { ...prev, ...patch, version: prev.version + (mutation ? 1 : 0) });
  while (days.size > MAX_CACHED_DAYS) days.delete(days.keys().next().value);
  listeners.forEach((fn) => fn(key));
}

const mutateLogs = (key, fn) => writeDay(key, { logs: fn((days.get(key) || emptyDay()).logs) }, { mutation: true });
const mutateSlots = (key, fn) => writeDay(key, { slots: fn((days.get(key) || emptyDay()).slots) }, { mutation: true });

// Test hook: forget every cached day.
export function clearFoodLogCache() {
  days.clear();
  pendingSaves.clear();
  cancelled.clear();
}

// Foods logged but not yet confirmed by the server. They show on screen under a
// temporary id; this remembers them so a refresh that lands mid-save can't
// make them vanish, and lets an edit or delete made in that moment wait for the
// real id.
let tempSeq = 0;
const pendingSaves = new Map(); // tempId -> { key, row, promise } (promise resolves to the real id, or null on failure)
const cancelled = new Set(); // temp ids deleted before their save finished

const isTempId = (id) => typeof id === 'string' && id.startsWith('tmp-');
const pendingRowsFor = (key) => [...pendingSaves.values()].filter((p) => p.key === key).map((p) => p.row);

export function useFoodLogs(date) {
  const { user } = useAuth();
  const key = user && date ? dayKey(user.id, date) : null;
  const cached = key ? days.get(key) : null;
  const [logs, setLogs] = useState(cached?.logs ?? []);
  const [slotRows, setSlotRows] = useState(cached?.slots ?? []);
  const [loading, setLoading] = useState(!cached?.loaded);

  // Follow the store: any instance's change to this day shows up here too.
  useEffect(() => {
    if (!key) return undefined;
    const sync = (changed) => {
      if (changed !== key) return;
      const day = days.get(key);
      if (!day) return;
      setLogs(day.logs);
      setSlotRows(day.slots);
    };
    listeners.add(sync);
    return () => { listeners.delete(sync); };
  }, [key]);

  const refetch = useCallback(async () => {
    if (!key) { setLogs([]); setSlotRows([]); setLoading(false); return; }
    // Something already known about this day shows straight away; only a day
    // never seen before waits on a spinner.
    const known = days.get(key);
    if (known) { setLogs(known.logs); setSlotRows(known.slots); }
    setLoading(!known?.loaded);
    const versionAtStart = known?.version ?? 0;
    // Unhandled before — a network blip here left loading stuck true
    // forever, since setLoading(false) below never ran (see useCustomFoods
    // for the same fix applied consistently across the data hooks).
    try {
      // Fetched together since both drive the same day's view — Slots mode
      // needs both to render a single timeline, and the whole point of
      // fetching them side by side is that a re-render always sees a
      // consistent pair rather than one refreshed a tick before the other.
      const [logData, slotData] = await Promise.all([
        getFoodLogsForDate(user.id, date),
        getDaySlots(user.id, date),
      ]);
      const now = days.get(key);
      // Logged, edited or deleted while this was in flight: what's on screen is
      // newer than what the server just answered, so keep it.
      if (now?.loaded && now.version !== versionAtStart) return;
      const pending = pendingRowsFor(key).filter((row) => !logData.some((r) => r.id === row.id));
      writeDay(key, { logs: [...logData, ...pending], slots: slotData, loaded: true });
    } catch (err) {
      console.error('Failed to load food logs:', err);
      if (!days.get(key)?.loaded) { setLogs([]); setSlotRows([]); } // nothing known and nothing fetched; an old copy stays rather than blanking
    } finally {
      setLoading(false);
    }
  }, [key, user, date]);

  useEffect(() => { refetch(); }, [refetch]);

  const items = useMemo(() => logs.map(mapRow), [logs]);
  const daySlots = useMemo(() => slotRows.map(mapSlotRow), [slotRows]);

  const meals = useMemo(() => {
    const grouped = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const item of items) {
      const mealKey = item.meal in grouped ? item.meal : 'snacks';
      grouped[mealKey].push(item);
    }
    return grouped;
  }, [items]);

  // Pro's daily_log_view === 'slots' option — custom-named slots instead
  // of the fixed meal enum (see src/lib/daySlots.js).
  const slotTimeline = useMemo(() => buildSlotTimeline(daySlots, items), [daySlots, items]);

  // The edit/delete/move helpers below all work the same way: change the screen
  // first, send the change to the server in the background, and put the screen
  // back (with a message) only if the server refuses. The call returns at once,
  // so a sheet closes and a toast shows without waiting on the network.
  const realId = useCallback(async (id) => {
    const pending = pendingSaves.get(id);
    return pending ? pending.promise : id;
  }, []);

  // mealName is optional — when omitted (Pro/time-based logging), the meal
  // category is derived from loggedAt purely so the food_logs row (which
  // still requires a meal value) has something sensible; the Pro UI never
  // shows this value to the user. slotId is Slots mode's own analogue of
  // mealName/loggedAt — which slot (if any) this item belongs to.
  const addFood = useCallback((food, mealName, loggedAt, slotId) => {
    if (!user || !date) return Promise.resolve();
    const meal = mealName ? mealName.toLowerCase() : mealFromDate(loggedAt || new Date());
    const entry = {
      loggedDate: date,
      meal,
      loggedAt: loggedAt || null,
      slotId: slotId ?? null,
      name: food.name,
      brand: food.brand || null,
      cal: food.cal,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fat: food.fat || 0,
      fibre: food.fibre || 0,
      sodium: food.sodium || 0,
      sugar: food.sugar || 0,
      saturatedFat: food.saturatedFat || 0,
      transFat: food.transFat || 0,
      cholesterol: food.cholesterol || 0,
      potassium: food.potassium || 0,
      addedSugar: food.addedSugar || 0,
      vitaminD: food.vitaminD || 0,
      calcium: food.calcium || 0,
      iron: food.iron || 0,
      vitaminA: food.vitaminA || 0,
      vitaminC: food.vitaminC || 0,
      polyunsaturatedFat: food.polyunsaturatedFat || 0,
      monounsaturatedFat: food.monounsaturatedFat || 0,
      magnesium: food.magnesium || 0,
      zinc: food.zinc || 0,
      vitaminB12: food.vitaminB12 || 0,
      folate: food.folate || 0,
      ...extendedOf(food),
      servingGrams: food.servingGrams || null,
      source: food.source,
      loggedAmount: food.loggedAmount ?? null,
      loggedUnit: food.loggedUnit ?? null,
      servingLabel: food.servingLabel ?? null,
      ingredients: food.ingredients ?? null,
    };
    const tempId = `tmp-${++tempSeq}`;
    const { row, extended } = buildFoodLogRow(user.id, entry);
    const tempRow = { ...row, ...extended, id: tempId, created_at: new Date().toISOString() };
    const dayAtLog = key;
    mutateLogs(dayAtLog, (rows) => [...rows, tempRow]);

    const promise = addFoodLog(user.id, entry).then((created) => {
      pendingSaves.delete(tempId);
      if (cancelled.delete(tempId)) {
        // Deleted while it was still saving: now there is a real row to remove.
        mutateLogs(dayAtLog, (rows) => rows.filter((r) => r.id !== tempId && r.id !== created.id));
        deleteFoodLog(created.id).catch((err) => console.error('Failed to remove a food deleted mid-save:', err));
        return null;
      }
      mutateLogs(dayAtLog, (rows) => {
        const others = rows.filter((r) => r.id !== created.id);
        const at = others.findIndex((r) => r.id === tempId);
        if (at === -1) return [...others, created];
        return others.map((r, i) => (i === at ? created : r));
      });
      return created.id;
    }).catch((err) => {
      console.error('Failed to save food:', err);
      pendingSaves.delete(tempId);
      cancelled.delete(tempId);
      mutateLogs(dayAtLog, (rows) => rows.filter((r) => r.id !== tempId));
      showAppToast(`Couldn't save ${food.name} — it wasn't added, try again`, true);
      return null;
    });
    pendingSaves.set(tempId, { key: dayAtLog, row: tempRow, promise });
    return Promise.resolve(tempRow);
  }, [user, date, key]);

  const deleteFood = useCallback((id) => {
    const removed = (days.get(key)?.logs || []).find((r) => r.id === id);
    mutateLogs(key, (rows) => rows.filter((r) => r.id !== id));
    if (isTempId(id) && pendingSaves.has(id)) {
      cancelled.add(id); // the save's own handler removes the real row once it exists
      return Promise.resolve();
    }
    deleteFoodLog(id).catch((err) => {
      console.error('Failed to delete food:', err);
      if (removed) mutateLogs(key, (rows) => (rows.some((r) => r.id === id) ? rows : [...rows, removed]));
      showAppToast("Couldn't delete — it's back, try again", true);
    });
    return Promise.resolve();
  }, [key]);

  const updateFood = useCallback((id, food) => {
    const before = (days.get(key)?.logs || []).find((r) => r.id === id);
    const { patch, extended } = buildFoodLogPatch(food);
    // Show the edit now, using the same columns the server is about to be sent.
    mutateLogs(key, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch, ...extended } : r)));
    realId(id).then((real) => {
      if (!real) return null; // its save failed or it was deleted; nothing to update
      return updateFoodLog(real, food);
    }).then((updated) => {
      if (!updated) return;
      mutateLogs(key, (rows) => rows.map((r) => (r.id === updated.id ? updated : r)));
    }).catch((err) => {
      console.error('Failed to update food:', err);
      if (before) mutateLogs(key, (rows) => rows.map((r) => (r.id === id ? before : r)));
      showAppToast("Couldn't save that change — it's been undone, try again", true);
    });
    return Promise.resolve(before ? { ...before, ...patch, ...extended } : undefined);
  }, [key, realId]);

  // Moves foods into a slot (null = Uncategorised); the local rows follow at once.
  const moveToSlot = useCallback((ids, slotId) => {
    const moved = new Set(ids);
    const before = new Map((days.get(key)?.logs || []).filter((r) => moved.has(r.id)).map((r) => [r.id, r.slot_id ?? null]));
    mutateLogs(key, (rows) => rows.map((r) => (moved.has(r.id) ? { ...r, slot_id: slotId ?? null } : r)));
    Promise.all(ids.map(realId)).then((real) => {
      const settled = real.filter(Boolean);
      if (settled.length) return moveFoodLogsToSlot(settled, slotId);
      return null;
    }).catch((err) => {
      console.error('Failed to move food:', err);
      mutateLogs(key, (rows) => rows.map((r) => (before.has(r.id) ? { ...r, slot_id: before.get(r.id) } : r)));
      showAppToast("Couldn't move that — it's back where it was, try again", true);
    });
    return Promise.resolve();
  }, [key, realId]);

  // Slot CRUD — same shape as the food-log actions above (call the db.js
  // function, patch local state from its result rather than re-fetching).
  const addSlot = useCallback(async (fields) => {
    if (!user || !date) return;
    const created = await createDaySlot(user.id, date, fields);
    mutateSlots(key, (rows) => [...rows, created]);
    return created;
  }, [user, date, key]);

  const editSlot = useCallback(async (id, fields) => {
    const updated = await updateDaySlot(id, fields);
    mutateSlots(key, (rows) => rows.map((s) => (s.id === id ? updated : s)));
    return updated;
  }, [key]);

  // Doesn't touch `logs` locally — the affected items' slot_id going null
  // server-side (on delete set null) means the next refetch is what moves
  // them into the Unsorted segment; deleting a slot rarely coincides with
  // needing that reflected instantly, and refetch() is one tap away.
  const removeSlot = useCallback(async (id) => {
    await deleteDaySlot(id);
    mutateSlots(key, (rows) => rows.filter((s) => s.id !== id));
  }, [key]);

  return { logs, meals, daySlots, slotTimeline, loading, addFood, deleteFood, updateFood, moveToSlot, addSlot, editSlot, removeSlot, refetch };
}
