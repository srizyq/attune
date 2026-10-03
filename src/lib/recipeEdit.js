import { initialEditState, editServings, scaleFood, sumFoodItems } from './foodMath';

// Editing a saved recipe's ingredients. Each ingredient is edited the same way
// a logged food is (LogItemRow): type an amount + unit and every nutrient is
// rescaled from what was saved, so the numbers always stay consistent with
// each other and with the weight on record.

/** What an ingredient's amount box should open showing: { amount, unit } as strings. */
export function ingredientEditState(item) {
  return initialEditState(item);
}

/**
 * The ingredient as it would be saved for the typed amount+unit. Only
 * persists a weight / logged amount when the ingredient had a known weight —
 * same rule as LogItemRow.handleSave, so a calorie-only ingredient never has a
 * weight invented for it.
 */
export function rescaleIngredient(item, amount, unit) {
  const hasWeight = !!item.servingGrams;
  const servings = editServings(item, amount, unit);
  const scaled = scaleFood(item, servings || 0);
  return {
    ...scaled,
    servingGrams: hasWeight ? Math.round(servings * item.servingGrams) : null,
    ...(hasWeight ? { loggedAmount: Number(amount) || null, loggedUnit: unit } : {}),
  };
}

/** The shape stored in saved_meals.items — quantity fields plus every nutrient total. */
export function snapshotIngredient(item) {
  return {
    name: item.name,
    servingGrams: item.servingGrams ?? null,
    loggedAmount: item.loggedAmount ?? null,
    loggedUnit: item.loggedUnit ?? null,
    ...sumFoodItems([item]),
  };
}

/**
 * Rows are { item, amount, unit } (the ingredient as last saved, plus what the
 * person has typed). Returns the previewed ingredients and the first problem
 * in words (null when it can be saved).
 */
export function evaluateRecipeDraft({ name, servings, rows }) {
  const items = rows.map((r) => rescaleIngredient(r.item, r.amount, r.unit));
  let error = null;
  if (!String(name || '').trim()) error = 'Give the recipe a name.';
  else if (!(Number(servings) > 0)) error = 'Servings must be more than 0.';
  else if (rows.length === 0) error = 'A recipe needs at least one ingredient.';
  else {
    const bad = rows.findIndex((r) => !(Number(r.amount) > 0));
    if (bad !== -1) error = `Enter an amount for ${rows[bad].item.name}.`;
  }
  const totals = sumFoodItems(items);
  const perServing = scaleFood(totals, 1 / (Number(servings) > 0 ? Number(servings) : 1));
  return { items, totals, perServing, error };
}
