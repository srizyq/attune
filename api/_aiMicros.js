// The "micros" mode of /api/estimate-food: asks Claude to estimate vitamins,
// minerals and fats for foods that no reference table (AUSNUT, USDA) matched —
// a photo-scanned meal, a custom food, a menu item. Kept apart from the handler
// so the prompt and the sanitising can be tested without the network.
import { MICRO_NUTRIENTS } from '../src/lib/microNutrients.js';

// Fibre, sodium and sugar come with every source, so they are never estimated.
const SKIP = new Set(['fibre', 'sodium', 'sugar']);
export const AI_MICRO_NUTRIENTS = MICRO_NUTRIENTS.filter((m) => !SKIP.has(m.key));
export const MAX_ITEMS = 8;

/** Cleans the request's items down to what the prompt may carry, or null when there are none. */
export function cleanItems(items) {
  if (!Array.isArray(items)) return null;
  const out = [];
  for (const raw of items.slice(0, MAX_ITEMS)) {
    const name = typeof raw?.name === 'string' ? raw.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!name) continue;
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v) * 10) / 10 : null);
    out.push({
      name,
      brand: typeof raw.brand === 'string' ? raw.brand.trim().slice(0, 60) : '',
      grams: num(raw.grams),
      cal: num(raw.cal),
    });
  }
  return out.length ? out : null;
}

export function buildMicrosPrompt(items) {
  const keys = AI_MICRO_NUTRIENTS.map((m) => `"${m.key}" (${m.unit})`).join(', ');
  const lines = items.map((it, i) => {
    const bits = [it.grams ? `${it.grams} g` : null, it.cal ? `${it.cal} kcal` : null].filter(Boolean).join(', ');
    return `${i + 1}. ${it.brand ? `${it.brand} ` : ''}${it.name}${bits ? ` — the portion eaten: ${bits}` : ''}`;
  });
  return `You're estimating vitamins, minerals and fats for foods someone logged in a nutrition-tracking app. No food database matched them, so use your knowledge of typical food composition (AUSNUT, USDA) for each food as normally prepared.

Foods (estimate for the portion given, not per 100 g):
${lines.join('\n')}

For each food give a number for every one of these nutrients, in the unit shown: ${keys}.
Use 0 only where the food genuinely has none (for example B12 in an apple). omega3 is long-chain only (EPA + DPA + DHA); alphaLinolenicAcid is separate.

Reply with ONLY a JSON object (no other text, no markdown fence): {"items": [{...}, ...]} with one object per food, in the same order, each keyed by the nutrient names above.`;
}

/** The model's reply -> one { key: number } per requested item (empty object where unusable). */
export function parseMicros(text, count) {
  const cleaned = String(text || '').trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  const parsed = JSON.parse(cleaned);
  const list = Array.isArray(parsed?.items) ? parsed.items : [];
  const allowed = new Set(AI_MICRO_NUTRIENTS.map((m) => m.key));
  return Array.from({ length: count }, (_, i) => {
    const out = {};
    for (const [key, value] of Object.entries(list[i] || {})) {
      const v = Number(value);
      if (allowed.has(key) && value !== null && value !== '' && Number.isFinite(v) && v >= 0 && v < 100000) out[key] = Math.round(v * 1000) / 1000;
    }
    return out;
  });
}
