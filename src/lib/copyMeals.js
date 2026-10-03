// Pure helpers behind CopyDayModal's "pick which items to copy" UI, kept out
// of the component so the selection/remap rules are testable on their own.

export const COPY_DEST_SAME = 'same';

// Tapping a meal header: if every item in it is already ticked, untick them
// all; otherwise tick them all (so a partly-ticked meal fills in rather than
// clearing). Returns a new Set — never mutates the one passed in.
export function toggleGroup(selected, ids) {
  const next = new Set(selected);
  const allOn = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allOn) next.delete(id);
    else next.add(id);
  }
  return next;
}

// The raw food_logs rows that should actually be inserted: just the ticked
// ones, optionally moved into a different meal.
//
// Moving to a different meal also clears logged_at. A meals-view item has no
// real time of day to preserve (new meals-view logs store logged_at null —
// see useFoodLogs.addFood), and a leftover 12:30 sitting on something that
// now says "dinner" would read as a bug the moment the day is viewed by
// time instead. Same-meal copies pass through untouched, so copyFoodLogs
// keeps re-dating their original time-of-day exactly as before.
export function rowsToCopy(rows, selectedIds, destMeal = COPY_DEST_SAME) {
  return rows
    .filter((row) => selectedIds.has(row.id))
    .map((row) => (
      destMeal !== COPY_DEST_SAME && row.meal !== destMeal
        ? { ...row, meal: destMeal, logged_at: null }
        : row
    ));
}
