// Borrowing vitamins and minerals for foods that came without any.
//
// Only AUSNUT (the Australian food composition table) carries most
// micronutrients. Photo and menu scans, AI estimates, custom foods, community
// barcodes and many branded products don't, so a day of such foods shows empty
// vitamin cards. For those foods this finds the closest AUSNUT food by name and
// scales its nutrients to the portion eaten. The result is always shown as an
// estimate, is never written to the diary, and never overrides a figure a food
// really carried.
import { MICRO_NUTRIENTS, EXTENDED_KEYS } from './microNutrients';
import { rankFoods } from './foodRank';

// Every food source carries these (AI estimates too), so they are never estimated.
const ALWAYS_PRESENT = new Set(['fibre', 'sodium', 'sugar']);
export const ESTIMATE_NUTRIENTS = MICRO_NUTRIENTS.filter((m) => !ALWAYS_PRESENT.has(m.key));
export const ESTIMATE_KEYS = ESTIMATE_NUTRIENTS.map((m) => m.key);
const EXTENDED = new Set(EXTENDED_KEYS);

const hasValue = (v) => v != null && v !== '' && Number.isFinite(Number(v));

/**
 * Whether a logged item carries a real figure for one nutrient. The original
 * nutrients were stored as 0 whenever a source didn't have them, so for those a
 * 0 is read as "no data"; the extended set uses null for unknown.
 */
export function hasData(item, key) {
  return EXTENDED.has(key) ? hasValue(item?.[key]) : Number(item?.[key]) > 0;
}

/** The nutrients this item has no figure for. */
export function missingKeys(item) {
  return ESTIMATE_KEYS.filter((key) => !hasData(item, key));
}

// ── Turning a food's name into a search ─────────────────────────────────────
const STOP = new Set([
  'with', 'and', 'the', 'for', 'from', 'style', 'flavour', 'flavoured', 'flavor', 'flavored', 'original', 'classic', 'large', 'small',
  'medium', 'regular', 'mini', 'serve', 'serving', 'serves', 'pack', 'packet', 'plain', 'new', 'free', 'brand', 'range', 'real',
  'protein', 'high', 'low', 'light', 'lite', 'extra', 'double', 'single', 'twin',
]);

// Too vague to be the only thing a search is based on.
const GENERIC = new Set(['powder', 'bar', 'bars', 'drink', 'drinks', 'meal', 'mix', 'snack', 'snacks', 'food', 'sauce', 'dessert', 'bowl', 'wrap', 'salad', 'sandwich', 'shake', 'pack', 'combo', 'special', 'platter']);

/** The meaningful words of a food's name, minus its brand, sizes and filler. */
export function nameTokens(name, brand = '') {
  const brandWords = new Set(String(brand || '').toLowerCase().split(/[^a-z]+/).filter(Boolean));
  const cleaned = String(name || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z\s]/g, ' ');
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w) && !brandWords.has(w));
  return [...new Set(words)];
}

/**
 * Searches to try, most specific first. Brand names usually lead a product's
 * name and the food itself comes last ("Chobani Greek Yoghurt"), so the words
 * are dropped from the front. Never a single word unless that is all there is.
 */
export function candidateQueries(tokens) {
  if (!tokens.length) return [];
  // "powder", "bar" or "sauce" alone would match any of hundreds of unrelated foods.
  if (tokens.length === 1) return GENERIC.has(tokens[0]) ? [] : [tokens[0]];
  const out = [];
  if (tokens.length >= 3) out.push(tokens.slice(-3).join(' '));
  out.push(tokens.slice(-2).join(' '));
  return [...new Set(out)];
}

// ── A matching AUSNUT row, per 100 g ────────────────────────────────────────
/** An ausnut_foods row's nutrients per 100 g, keyed like a logged item (unknown extended = null). */
export function per100Micros(row) {
  return Object.fromEntries(ESTIMATE_NUTRIENTS.map((m) => {
    const raw = row?.[m.column];
    if (EXTENDED.has(m.key)) return [m.key, hasValue(raw) ? Number(raw) : null];
    return [m.key, Number(raw) || 0];
  }));
}

/**
 * How many 100 g of the matched food this portion is. By weight when the weight
 * is known; by calories when it isn't, or when the two disagree badly (the match
 * is a very different density from what was eaten). null when neither works.
 */
export function portionFactor({ grams, cal }, row) {
  const kcal100 = Number(row?.calories) || 0;
  const g = Number(grams) || 0;
  const c = Number(cal) || 0;
  const byCal = kcal100 > 0 && c > 0 ? c / kcal100 : null;
  if (g > 0) {
    const byWeight = g / 100;
    if (byCal && (byWeight * kcal100 > c * 2.5 || byWeight * kcal100 < c / 2.5)) return byCal;
    return byWeight;
  }
  return byCal;
}

const round = (v, dp) => Math.round(v * 10 ** dp) / 10 ** dp;

// ── Estimating one thing, then one logged item ──────────────────────────────
async function matchFor(name, brand, search) {
  for (const query of candidateQueries(nameTokens(name, brand))) {
    const rows = await search(query);
    if (!rows?.length) continue;
    const ranked = rankFoods(rows.map((row) => ({ name: row.name, source: 'ausnut', row })), query);
    if (ranked[0]) return ranked[0].row;
  }
  return null;
}

async function estimateOne({ name, brand, grams, cal }, search) {
  const row = await matchFor(name, brand, search);
  if (!row) return null;
  const factor = portionFactor({ grams, cal }, row);
  if (!factor) return null;
  const per100 = per100Micros(row);
  const micros = {};
  for (const m of ESTIMATE_NUTRIENTS) {
    const v = per100[m.key];
    if (v == null) continue;
    micros[m.key] = round(v * factor, m.extended ? 3 : 2);
  }
  return { micros, from: row.name };
}

/**
 * Estimates the nutrients a logged item has no figure for. A scanned meal that
 * kept its ingredients is estimated ingredient by ingredient. Resolves to
 * { micros, from } — micros only for nutrients the item was missing — or null
 * when nothing similar was found.
 */
export async function estimateItem(item, search) {
  const missing = new Set(missingKeys(item));
  if (missing.size === 0 || !(Number(item.cal) > 0)) return null;

  const parts = Array.isArray(item.ingredients) && item.ingredients.length
    ? item.ingredients.map((ing) => ({ name: ing.name, grams: ing.grams, cal: ing.cal }))
    : [{ name: item.name, brand: item.brand, grams: item.servingGrams, cal: item.cal }];

  const total = {};
  const from = [];
  for (const part of parts) {
    const found = await estimateOne(part, search);
    if (!found) continue;
    from.push(found.from);
    for (const [key, v] of Object.entries(found.micros)) {
      if (missing.has(key)) total[key] = (total[key] || 0) + v;
    }
  }
  if (from.length === 0) return null;
  const micros = Object.fromEntries(Object.entries(total).map(([key, v]) => [key, round(v, EXTENDED.has(key) ? 3 : 2)]));
  return { micros, from };
}

/** Wraps a search so the same words are only looked up once. */
export function cachedSearch(search) {
  const cache = new Map();
  return (query) => {
    const key = query.toLowerCase();
    if (!cache.has(key)) cache.set(key, Promise.resolve(search(query)).catch((err) => { cache.delete(key); throw err; }));
    return cache.get(key);
  };
}

/** Estimates for every item that needs it: Map(item id → { micros, from }). A failed lookup just leaves that item without one. */
export async function estimateItems(items, search, { concurrency = 4 } = {}) {
  const result = new Map();
  const queue = (items || []).filter((item) => item?.id != null && missingKeys(item).length > 0 && Number(item.cal) > 0);
  let next = 0;
  async function worker() {
    while (next < queue.length) {
      const item = queue[next++];
      try {
        const est = await estimateItem(item, search);
        if (est) result.set(item.id, est);
      } catch (err) {
        console.error('Could not estimate micronutrients for', item.name, err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return result;
}

/**
 * Per nutrient: how many foods carried a real figure, how many got an
 * estimate instead, and the estimates' total. What the Nutrients page turns into
 * "based on 5 of 12 foods · estimates for 4 more".
 */
export function estimateSummary(items, estimates) {
  const list = items || [];
  const perKey = {};
  for (const key of ESTIMATE_KEYS) {
    let measured = 0;
    let estimated = 0;
    let estTotal = 0;
    for (const item of list) {
      if (hasData(item, key)) { measured += 1; continue; }
      const v = estimates?.get(item.id)?.micros?.[key];
      if (v != null && (EXTENDED.has(key) ? Number.isFinite(Number(v)) : Number(v) > 0)) { estimated += 1; estTotal += Number(v); }
    }
    perKey[key] = { measured, estimated, estTotal };
  }
  const estimatedItems = list.filter((item) => estimates?.has(item.id)).length;
  return { perKey, estimatedItems, of: list.length };
}

/**
 * What a nutrient's card should say: a dash when no food carried it (and none
 * could be estimated), and a line saying how much of the total was measured and
 * how much estimated. Nothing to say for a day with nothing logged.
 */
export function microNote(summary, key) {
  const k = summary?.perKey?.[key];
  const n = summary?.of || 0;
  if (!k || n === 0) return { note: null, noData: false, approx: false };
  const { measured: m, estimated: e } = k;
  if (m === 0 && e === 0) return { note: 'No data in the foods logged', noData: true, approx: false };
  if (m === n) return { note: null, noData: false, approx: false };
  const note = m > 0 && e > 0 ? `Data for ${m} of ${n} foods · estimates for ${e} more`
    : m > 0 ? `Data for ${m} of ${n} foods`
      : `Estimated from similar foods (${e} of ${n})`;
  return { note, noData: false, approx: e > 0 };
}
