import { MICRO_NUTRIENTS } from './microNutrients';

export const MAX_MICRO_TARGET = 100000; // mirrors set_client_micro_targets in schema.sql

// stored map -> text inputs for a form (blank = "use the default guideline").
export function microTargetsToInputs(targets, nutrients = MICRO_NUTRIENTS) {
  return Object.fromEntries(nutrients.map((n) => [n.key, targets?.[n.key] != null ? String(targets[n.key]) : '']));
}

// text inputs -> the map to save, or the first problem in words. Blank means
// "no custom target" and is left out (not stored as 0 — zero is a real
// target, e.g. trans fat); anything else must be a finite number in range.
export function parseMicroTargetInputs(inputs, nutrients = MICRO_NUTRIENTS) {
  const targets = {};
  for (const n of nutrients) {
    const raw = String(inputs?.[n.key] ?? '').trim();
    if (raw === '') continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > MAX_MICRO_TARGET) {
      return { targets: null, error: `${n.label} must be a number between 0 and ${MAX_MICRO_TARGET.toLocaleString()}.` };
    }
    targets[n.key] = value;
  }
  return { targets, error: null };
}
