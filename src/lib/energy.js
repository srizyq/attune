// Food labels give energy in kilojoules, calories (kcal), or both — and a
// number read or typed as one is easily taken for the other. These keep the
// conversion in one place.
export const KJ_PER_KCAL = 4.184;

export const ENERGY_UNITS = ['kcal', 'kJ'];

/** A typed energy value in the chosen unit, as whole kilocalories. Blank or invalid reads as 0. */
export function toKcal(value, unit = 'kcal') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(unit === 'kJ' ? n / KJ_PER_KCAL : n);
}

/** Kilocalories shown in the chosen unit, as a whole number. */
export function fromKcal(kcal, unit = 'kcal') {
  const n = Number(kcal);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(unit === 'kJ' ? n * KJ_PER_KCAL : n);
}

/** Calories worked out from protein, carbs and fat (4, 4 and 9 per gram). */
export function kcalFromMacros({ protein, carbs, fat }) {
  const g = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  return Math.round(g(protein) * 4 + g(carbs) * 4 + g(fat) * 9);
}
