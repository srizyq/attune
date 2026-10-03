import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addFoodLog, deleteFoodLog, updateFoodLog, getFoodLogsForDate, getDaySlots, createDaySlot, updateDaySlot, deleteDaySlot } from '../lib/db';
import { mealFromDate } from '../lib/mealTime';
import { mapSlotRow, buildSlotTimeline } from '../lib/daySlots';
import { extendedFromRow, EXTENDED_KEYS } from '../lib/microNutrients';

export function mapRow(row) {
  return {
    id: row.id,
    name: row.food_name,
    brand: row.brand || null,
    meal: row.meal,
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
  };
}

// The extended nutrients of a food, passed through as-is (null = unknown).
function extendedOf(food) {
  return Object.fromEntries(EXTENDED_KEYS.map((key) => [key, food[key] ?? null]));
}

export function useFoodLogs(date) {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [slotRows, setSlotRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !date) { setLogs([]); setSlotRows([]); setLoading(false); return; }
    setLoading(true);
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
      setLogs(logData);
      setSlotRows(slotData);
    } catch (err) {
      console.error('Failed to load food logs:', err);
      setLogs([]);
      setSlotRows([]);
    } finally {
      setLoading(false);
    }
  }, [user, date]);

  useEffect(() => { refetch(); }, [refetch]);

  const items = useMemo(() => logs.map(mapRow), [logs]);
  const daySlots = useMemo(() => slotRows.map(mapSlotRow), [slotRows]);

  const meals = useMemo(() => {
    const grouped = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const item of items) {
      const key = item.meal in grouped ? item.meal : 'snacks';
      grouped[key].push(item);
    }
    return grouped;
  }, [items]);

  // Pro's daily_log_view === 'slots' option — custom-named slots instead
  // of the fixed meal enum (see src/lib/daySlots.js).
  const slotTimeline = useMemo(() => buildSlotTimeline(daySlots, items), [daySlots, items]);

  // mealName is optional — when omitted (Pro/time-based logging), the meal
  // category is derived from loggedAt purely so the food_logs row (which
  // still requires a meal value) has something sensible; the Pro UI never
  // shows this value to the user. slotId is Slots mode's own analogue of
  // mealName/loggedAt — which slot (if any) this item belongs to.
  const addFood = useCallback(async (food, mealName, loggedAt, slotId) => {
    if (!user || !date) return;
    const meal = mealName ? mealName.toLowerCase() : mealFromDate(loggedAt || new Date());
    const created = await addFoodLog(user.id, {
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
    });
    setLogs(prev => [...prev, created]);
    return created;
  }, [user, date]);

  const deleteFood = useCallback(async (id) => {
    await deleteFoodLog(id);
    setLogs(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateFood = useCallback(async (id, food) => {
    const updated = await updateFoodLog(id, food);
    setLogs(prev => prev.map(l => (l.id === id ? updated : l)));
    return updated;
  }, []);

  // Slot CRUD — same shape as the food-log actions above (call the db.js
  // function, patch local state from its result rather than re-fetching).
  const addSlot = useCallback(async (fields) => {
    if (!user || !date) return;
    const created = await createDaySlot(user.id, date, fields);
    setSlotRows(prev => [...prev, created]);
    return created;
  }, [user, date]);

  const editSlot = useCallback(async (id, fields) => {
    const updated = await updateDaySlot(id, fields);
    setSlotRows(prev => prev.map(s => (s.id === id ? updated : s)));
    return updated;
  }, []);

  // Doesn't touch `logs` locally — the affected items' slot_id going null
  // server-side (on delete set null) means the next refetch is what moves
  // them into the Unsorted segment; deleting a slot rarely coincides with
  // needing that reflected instantly, and refetch() is one tap away.
  const removeSlot = useCallback(async (id) => {
    await deleteDaySlot(id);
    setSlotRows(prev => prev.filter(s => s.id !== id));
  }, []);

  return { logs, meals, daySlots, slotTimeline, loading, addFood, deleteFood, updateFood, addSlot, editSlot, removeSlot, refetch };
}
