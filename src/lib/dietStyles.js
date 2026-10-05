// Diet-style presets for the macro split on Goals & Targets, and the net-carbs
// arithmetic used wherever the day's carbs are measured against the carb target.
// A style is just a protein/fat percentage (carbs always fill the rest), so
// picking one only moves the sliders — nothing about a style is stored.

export const DIET_STYLES = [
  { id: 'balanced', label: 'Balanced', desc: 'Follows your goal', split: null },
  { id: 'low-carb', label: 'Low carb', desc: '25% carbs', split: { protein: 30, fat: 45 } },
  { id: 'keto', label: 'Keto', desc: '5% carbs', split: { protein: 25, fat: 70 }, netCarbs: true },
];

// The sliders' bounds. Fat goes to 80% so keto is reachable; protein stays
// where it was.
export const PROTEIN_PCT_RANGE = { min: 10, max: 60 };
export const FAT_PCT_RANGE = { min: 10, max: 80 };

// Which style the current sliders amount to: an exact preset match, "balanced"
// when they equal the goal's own recommended split, otherwise "custom".
export function dietStyleFor(proteinPct, fatPct, goalSplit) {
  for (const s of DIET_STYLES) {
    if (s.split && s.split.protein === proteinPct && s.split.fat === fatPct) return s.id;
  }
  if (goalSplit && Math.round(goalSplit.protein * 100) === proteinPct && Math.round(goalSplit.fat * 100) === fatPct) return 'balanced';
  return 'custom';
}

// The protein/fat percentages to snap the sliders to for a style; "balanced"
// returns the goal's recommended split.
export function splitForStyle(styleId, goalSplit) {
  const style = DIET_STYLES.find((s) => s.id === styleId);
  if (!style) return null;
  if (!style.split) return { protein: Math.round(goalSplit.protein * 100), fat: Math.round(goalSplit.fat * 100) };
  return { ...style.split };
}

// Carbs minus fibre, never below zero and never more fibre than carbs (a food
// listing more fibre than carbs is a data error, not negative carbs).
export function netCarbs(carbs, fibre) {
  const c = Number(carbs) || 0;
  const f = Number(fibre) || 0;
  return Math.max(0, c - Math.min(f, c));
}

// The carbs figure to show/compare for one day's totals or one item.
export function carbsToShow(carbs, fibre, net) {
  return net ? netCarbs(carbs, fibre) : Number(carbs) || 0;
}

export function carbsLabel(net) {
  return net ? 'Net carbs' : 'Carbs';
}
