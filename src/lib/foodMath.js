// Amount+unit selector shared by the add-food flow and the daily-log edit
// flow, so both let you say "200g" / "1.5kg" / "2 servings" rather than
// typing a bare, ambiguous multiplier. ml uses the same 1:1 mass
// approximation as the rest of food nutrition labelling (water-like
// density), so it shares g's toGrams factor — only its unit id/label
// differ, which is what lets a liquid food's servingUnit pick it out via
// unitsFor below instead of offering kg/lb/oz for a carton of milk.
export const UNITS = [
  { id: "serving", label: "serving", toGrams: null },
  { id: "g", label: "g", toGrams: 1 },
  { id: "kg", label: "kg", toGrams: 1000 },
  { id: "lb", label: "lb", toGrams: 453.592 },
  { id: "oz", label: "oz", toGrams: 28.3495 },
  { id: "ml", label: "ml", toGrams: 1 },
];

// Which UNITS options make sense for a food, based on whether its own
// serving is measured in grams (solid food — offer g/kg/lb/oz) or
// millilitres (a drink — offer ml instead, not a mass unit that was never
// on its label in the first place).
export function unitsFor(servingUnit) {
  return servingUnit === "ml"
    ? UNITS.filter(u => u.id === "serving" || u.id === "ml")
    : UNITS.filter(u => u.id !== "ml");
}

export function formatAmountUnit(amount, unitId) {
  const unitDef = UNITS.find(u => u.id === unitId);
  if (!unitDef) return `${amount}`;
  if (unitId === "serving") return `${amount} serving${amount === 1 ? "" : "s"}`;
  return `${amount}${unitDef.label}`;
}

// How many base servings `amount` of `unit` represents for a food whose
// "1 serving" (its base cal/protein/etc values) weighs `servingGrams`.
export function amountToServings(amount, unitId, servingGrams) {
  if (!amount || amount <= 0) return 0;
  if (unitId === "serving") return amount;
  const unit = UNITS.find(u => u.id === unitId);
  const grams = amount * unit.toGrams;
  return grams / (servingGrams || 100);
}

// Every field scaleFood scales — shared here so summing (below) touches
// exactly the same set instead of two lists silently drifting apart.
const NUTRIENT_FIELDS = [
  'cal', 'protein', 'carbs', 'fat', 'fibre', 'sodium', 'sugar',
  'saturatedFat', 'transFat', 'cholesterol', 'potassium', 'addedSugar',
  'vitaminD', 'calcium', 'iron', 'vitaminA', 'vitaminC',
  'polyunsaturatedFat', 'monounsaturatedFat', 'magnesium', 'zinc',
  'vitaminB12', 'folate',
];

// Sums every nutrient field across a recipe's ingredients into one combined
// food-shaped object — the natural first step before scaleFood(totals,
// servingsToLog / recipe.servings) turns "the whole batch" into "however
// many servings someone's actually logging."
export function sumFoodItems(items) {
  const totals = Object.fromEntries(NUTRIENT_FIELDS.map(f => [f, 0]));
  for (const item of items) {
    for (const field of NUTRIENT_FIELDS) {
      totals[field] += Number(item[field]) || 0;
    }
  }
  return totals;
}

// Scales every macro/micronutrient field on a food object by a servings
// multiplier — shared between the search/add flow (scaling a food before
// logging it) and the daily-log edit flow (scaling an already-logged item
// by an amount/unit adjustment instead of hand-typing new macro numbers).
export function scaleFood(food, servings) {
  const round1 = n => Math.round(n * 10) / 10;
  return {
    ...food,
    cal: Math.round(food.cal * servings),
    protein: round1(food.protein * servings),
    carbs: round1(food.carbs * servings),
    fat: round1(food.fat * servings),
    fibre: round1((food.fibre || 0) * servings),
    sodium: Math.round((food.sodium || 0) * servings),
    sugar: round1((food.sugar || 0) * servings),
    saturatedFat: round1((food.saturatedFat || 0) * servings),
    transFat: round1((food.transFat || 0) * servings),
    cholesterol: Math.round((food.cholesterol || 0) * servings),
    potassium: Math.round((food.potassium || 0) * servings),
    addedSugar: round1((food.addedSugar || 0) * servings),
    vitaminD: round1((food.vitaminD || 0) * servings),
    calcium: Math.round((food.calcium || 0) * servings),
    iron: round1((food.iron || 0) * servings),
    vitaminA: Math.round((food.vitaminA || 0) * servings),
    vitaminC: round1((food.vitaminC || 0) * servings),
    polyunsaturatedFat: round1((food.polyunsaturatedFat || 0) * servings),
    monounsaturatedFat: round1((food.monounsaturatedFat || 0) * servings),
    magnesium: round1((food.magnesium || 0) * servings),
    zinc: round1((food.zinc || 0) * servings),
    vitaminB12: round1((food.vitaminB12 || 0) * servings),
    folate: round1((food.folate || 0) * servings),
  };
}
