// Pure maths for the menu-scan confirm step: the AI's estimate for the
// picked dish, a portion size (a multiplier of that estimate) and any
// "quick tweak" chips (per-tweak calorie/macro deltas, e.g. "no cheese")
// the person has switched on. Kept out of the component so the order of
// operations — tweaks first, then portion — is one tested rule.

export const HIGH_SODIUM_MG = 800;

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * @param base    { cal, protein, carbs, fat } — the estimate at the as-listed portion
 * @param portion { scale } | null
 * @param tweaks  [{ cal, protein, carbs, fat }] — deltas relative to the as-listed portion
 * @param extras  { sodium_mg, fibre_g, sugar_g } | null — per as-listed portion; scaled by portion only
 */
export function adjustPick(base, portion, tweaks = [], extras = null) {
  const scale = portion && Number.isFinite(portion.scale) && portion.scale > 0 ? portion.scale : 1;
  const sum = (key) => Math.max(0, (Number(base[key]) || 0) + tweaks.reduce((s, t) => s + (Number(t[key]) || 0), 0)) * scale;
  const out = {
    cal: Math.round(sum('cal')),
    protein: round1(sum('protein')),
    carbs: round1(sum('carbs')),
    fat: round1(sum('fat')),
  };
  if (extras) {
    if (extras.sodium_mg != null) out.sodium = Math.round(extras.sodium_mg * scale);
    if (extras.fibre_g != null) out.fibre = round1(extras.fibre_g * scale);
    if (extras.sugar_g != null) out.sugar = round1(extras.sugar_g * scale);
  }
  return out;
}

/** "No cheese (-90 kcal)" — the kcal change is the point of a tweak, so it's on the chip. */
export function tweakChipLabel(tweak) {
  const cal = Math.round(Number(tweak.cal) || 0);
  if (!cal) return tweak.label;
  return `${tweak.label} (${cal > 0 ? '+' : '-'}${Math.abs(cal)} kcal)`;
}

/** "Includes Dairy, Gluten • High sodium (1,180mg)" or null when there is nothing worth flagging. */
export function includesLine(allergens = [], sodiumMg = null) {
  const parts = [];
  if (allergens.length) parts.push(`Includes ${allergens.join(', ')}`);
  if (sodiumMg != null && sodiumMg >= HIGH_SODIUM_MG) parts.push(`High sodium (${Math.round(sodiumMg).toLocaleString()}mg)`);
  return parts.length ? parts.join(' • ') : null;
}

/** Name to log: the dish, plus whichever tweaks were switched on ("… (no cheese, sauce on side)"). */
export function loggedName(baseName, tweaks = []) {
  if (!tweaks.length) return baseName;
  return `${baseName} (${tweaks.map((t) => t.label.toLowerCase()).join(', ')})`;
}

/** Normalised {x, y, w, h} (0-1) of the dish's text box [ymin, xmin, ymax, xmax] (0-1000), with a little context around it. */
const CROP_PAD = 40; // of 1000 — a little context around the dish line

export function cropRect(box) {
  const [ymin, xmin, ymax, xmax] = box;
  const y0 = Math.max(0, ymin - CROP_PAD);
  const x0 = Math.max(0, xmin - CROP_PAD);
  const y1 = Math.min(1000, ymax + CROP_PAD);
  const x1 = Math.min(1000, xmax + CROP_PAD);
  return { x: x0 / 1000, y: y0 / 1000, w: (x1 - x0) / 1000, h: (y1 - y0) / 1000 };
}

