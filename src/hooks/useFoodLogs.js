import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { addFoodLog, deleteFoodLog, updateFoodLog, getFoodLogsForDate } from '../lib/db';
import { mealFromDate, buildDayTimeline } from '../lib/mealTime';

export function mapRow(row) {
  return {
    id: row.id,
    name: row.food_name,
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
    servingGrams: row.serving_grams || null,
    loggedAt: row.logged_at || null,
    createdAt: row.created_at || null,
  };
}

export function useFoodLogs(date) {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user || !date) { setLogs([]); setLoading(false); return; }
    setLoading(true);
    const data = await getFoodLogsForDate(user.id, date);
    setLogs(data);
    setLoading(false);
  }, [user, date]);

  useEffect(() => { refetch(); }, [refetch]);

  const items = useMemo(() => logs.map(mapRow), [logs]);

  const meals = useMemo(() => {
    const grouped = { breakfast: [], lunch: [], dinner: [], snacks: [] };
    for (const item of items) {
      const key = item.meal in grouped ? item.meal : 'snacks';
      grouped[key].push(item);
    }
    return grouped;
  }, [items]);

  // Pro users' daily log view — same items, but covering the full
  // 12am–11pm day instead of by meal category, with empty stretches
  // collapsed into expandable gap segments (see buildDayTimeline).
  const dayTimeline = useMemo(() => buildDayTimeline(items), [items]);

  // mealName is optional — when omitted (Pro/time-based logging), the meal
  // category is derived from loggedAt purely so the food_logs row (which
  // still requires a meal value) has something sensible; the Pro UI never
  // shows this value to the user.
  const addFood = useCallback(async (food, mealName, loggedAt) => {
    if (!user || !date) return;
    const meal = mealName ? mealName.toLowerCase() : mealFromDate(loggedAt || new Date());
    const created = await addFoodLog(user.id, {
      loggedDate: date,
      meal,
      loggedAt: loggedAt || null,
      name: food.name,
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
      servingGrams: food.servingGrams || null,
      source: food.source,
      loggedAmount: food.loggedAmount ?? null,
      loggedUnit: food.loggedUnit ?? null,
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

  return { logs, meals, dayTimeline, loading, addFood, deleteFood, updateFood, refetch };
}
