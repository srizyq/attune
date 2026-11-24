import { MICRO_NUTRIENTS, formatMicro } from './microNutrients';
import { nutrientDetail } from './foodDetails';
import { hasData } from './microEstimate';
import { round1 } from './format';

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n]));

// The nutrients the edit page shows inline, most useful first. Fibre, sugar and
// sodium come with every food (a zero is a real zero); the rest appear only when
// the food has a measured figure, so nothing is shown as 0 that is really unknown.
// The full list, estimates included, is on the food details page.
const TILE_KEYS = ['fibre', 'sugar', 'sodium', 'saturatedFat', 'cholesterol', 'calcium', 'potassium', 'iron', 'magnesium', 'zinc', 'vitaminA', 'vitaminC', 'vitaminD', 'vitaminB12', 'folate'];
const ALWAYS = new Set(['fibre', 'sugar', 'sodium']);
export const MAX_TILES = 8;

/** [{ key, label, value, unit, pct, added }] for a food at the amount it is shown at. pct = share of the daily target. */
export function nutritionTiles(food, targets) {
  return TILE_KEYS
    .filter((key) => ALWAYS.has(key) || hasData(food, key))
    .slice(0, MAX_TILES)
    .map((key) => {
      const n = BY_KEY[key];
      const d = nutrientDetail(food, key, null, targets);
      return { key, label: n.label, value: formatMicro(n, food[key]), unit: n.unit, pct: d.pct, added: key === 'sugar' && Number(food.addedSugar) > 0 ? round1(food.addedSugar) : null };
    });
}
