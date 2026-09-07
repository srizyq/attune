// Amount+unit selector shared by the add-food flow and the daily-log edit
// flow, so both let you say "200g" / "1.5kg" / "2 servings" rather than
// typing a bare, ambiguous multiplier.
export const UNITS = [
  { id: "serving", label: "serving", toGrams: null },
  { id: "g", label: "g", toGrams: 1 },
  { id: "kg", label: "kg", toGrams: 1000 },
  { id: "lb", label: "lb", toGrams: 453.592 },
  { id: "oz", label: "oz", toGrams: 28.3495 },
];

// How many base servings `amount` of `unit` represents for a food whose
// "1 serving" (its base cal/protein/etc values) weighs `servingGrams`.
export function amountToServings(amount, unitId, servingGrams) {
  if (!amount || amount <= 0) return 0;
  if (unitId === "serving") return amount;
  const unit = UNITS.find(u => u.id === unitId);
  const grams = amount * unit.toGrams;
  return grams / (servingGrams || 100);
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
