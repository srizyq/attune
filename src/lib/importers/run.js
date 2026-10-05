// Writes a parsed import (see diary.js) to the account. Food goes in whole days
// at a time: a day is either imported completely or not at all, so a failure
// part-way never leaves a half-filled day behind — and because days that already
// have food are skipped by default, running the same import again after a
// failure (or by accident) fills in what's missing without duplicating anything.

export const MAX_ENTRIES = 50000;
export const CHUNK_ROWS = 300;
export const IMPORT_SOURCE = 'import';

export function toFoodLogRow(userId, e) {
  return {
    user_id: userId,
    logged_date: e.loggedDate,
    meal: e.meal,
    food_name: e.name,
    calories: e.cal,
    protein_g: e.protein,
    carbs_g: e.carbs,
    fat_g: e.fat,
    fibre_g: e.fibre,
    sugar_g: e.sugar,
    sodium_mg: e.sodium,
    saturated_fat_g: e.saturatedFat,
    cholesterol_mg: e.cholesterol,
    potassium_mg: e.potassium,
    calcium_mg: e.calcium,
    iron_mg: e.iron,
    logged_amount: 1,
    logged_unit: 'serving',
    logged_at: null,
    source: IMPORT_SOURCE,
  };
}

export function toWeightLogRow(userId, w) {
  return { user_id: userId, logged_date: w.date, weight: w.weight, unit: w.unit };
}

// Groups entries by date and packs whole days into chunks of at most `max` rows
// (a single day bigger than that gets a chunk to itself).
export function chunkByDay(entries, max = CHUNK_ROWS) {
  const byDay = new Map();
  for (const e of entries) {
    if (!byDay.has(e.loggedDate)) byDay.set(e.loggedDate, []);
    byDay.get(e.loggedDate).push(e);
  }
  const chunks = [];
  let current = [];
  let currentDays = 0;
  for (const day of [...byDay.keys()].sort()) {
    const rows = byDay.get(day);
    if (current.length > 0 && current.length + rows.length > max) { chunks.push({ rows: current, days: currentDays }); current = []; currentDays = 0; }
    current.push(...rows);
    currentDays++;
  }
  if (current.length > 0) chunks.push({ rows: current, days: currentDays });
  return chunks;
}

// What an import would do, before doing it: which food days would be left alone
// because the account already has food on them.
export function planImport(parsed, existingDays, skipExistingDays) {
  const existing = existingDays instanceof Set ? existingDays : new Set(existingDays || []);
  const skippedDays = skipExistingDays ? parsed.days.filter((d) => existing.has(d)) : [];
  const skipSet = new Set(skippedDays);
  const entries = parsed.entries.filter((e) => !skipSet.has(e.loggedDate));
  return {
    entries,
    days: new Set(entries.map((e) => e.loggedDate)).size,
    skippedDays: skippedDays.length,
    skippedEntries: parsed.entries.length - entries.length,
  };
}

// db: { insertFoodLogRows(rows), insertWeightLogRows(rows) → number actually added }
export async function runImport({ userId, parsed, existingDays, skipExistingDays = true, onProgress, db }) {
  const plan = planImport(parsed, existingDays, skipExistingDays);
  const chunks = chunkByDay(plan.entries);
  const result = { foodImported: 0, daysImported: 0, skippedDays: plan.skippedDays, weightImported: 0, weightSkipped: 0, error: null };
  const totalRows = plan.entries.length + parsed.weights.length;
  let done = 0;

  for (const chunk of chunks) {
    try {
      await db.insertFoodLogRows(chunk.rows.map((e) => toFoodLogRow(userId, e)));
    } catch (err) {
      result.error = err?.message || 'Something went wrong while saving.';
      return result;
    }
    result.foodImported += chunk.rows.length;
    result.daysImported += chunk.days;
    done += chunk.rows.length;
    onProgress?.({ done, total: totalRows });
  }

  if (parsed.weights.length > 0) {
    try {
      const added = await db.insertWeightLogRows(parsed.weights.map((w) => toWeightLogRow(userId, w)));
      result.weightImported = added;
      result.weightSkipped = parsed.weights.length - added;
    } catch (err) {
      result.error = err?.message || 'Something went wrong while saving your weight.';
      return result;
    }
    done += parsed.weights.length;
    onProgress?.({ done, total: totalRows });
  }
  return result;
}
