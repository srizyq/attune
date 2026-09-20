import { mapRow } from '../hooks/useFoodLogs';
import { MICRO_KEYS } from './microNutrients';

// The nutrition of a stored row — a food_logs row (Recent / Frequent) or a
// favourite_foods row, whose nutrient columns are named identically — as the
// fields of an app-side food: cal / protein / carbs / fat plus every
// micronutrient. Goes through mapRow (the one place that knows the columns), so
// the older nutrients read 0 when absent and the extended ones stay null when
// the row doesn't carry them: "unknown" never turns into a made-up zero when the
// food is re-logged. Only nutrients are returned — never id, name or source.
export function foodNutrientsFromRow(row) {
  const item = mapRow(row);
  return {
    cal: item.cal,
    protein: item.protein,
    carbs: item.carbs,
    fat: item.fat,
    ...Object.fromEntries(MICRO_KEYS.map((key) => [key, item[key]])),
  };
}

// A food_logs row as a Recent / Frequent card. `meta` is the caption the page
// builds (recentRowMeta). Row is already the most recent (or a representative)
// entry for that name, so its own logged_amount / logged_unit *is* "last used".
export function loggedRowToFood(row, { idPrefix, meta, cuisine }) {
  return {
    id: idPrefix + row.id,
    name: row.food_name,
    meta,
    ...(cuisine ? { cuisine } : {}),
    ...foodNutrientsFromRow(row),
    servingGrams: row.serving_grams || 100,
    source: row.source || 'log',
    lastAmount: row.logged_amount != null ? Number(row.logged_amount) : null,
    lastUnit: row.logged_unit || null,
  };
}

// A favourite_foods row as a card. Favourites aren't food_logs rows, so "last
// used" comes from a separate lookup (`last`: { amount, unit } or undefined)
// and the caption (`meta`) from the page.
export function favouriteRowToFood(row, { meta, last }) {
  return {
    id: 'fav_' + row.id,
    name: row.name,
    meta,
    ...foodNutrientsFromRow(row),
    servingGrams: row.serving_grams || 100,
    source: row.source || 'favourite',
    lastAmount: last?.amount ?? null,
    lastUnit: last?.unit ?? null,
  };
}
