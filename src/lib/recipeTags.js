// Tags, prep time, filtering and "featured" for the Recipes page. Pure
// functions, so the rules are unit-tested. The tag limits mirror the database
// (valid_recipe_tags in supabase/schema.sql); recipeTags.test.js is the guard.
import { sumFoodItems, scaleFood } from './foodMath';

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

const squash = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

// What someone typed, as a tag: spaces tidied, cut to the length the database
// allows. '' means "nothing to add".
export function cleanTag(raw) {
  return squash(raw).slice(0, MAX_TAG_LENGTH).trim();
}

// Adds a tag unless it is empty, already there (any capitals) or the recipe is
// full. Returns the same array when nothing changes, so callers can compare.
export function addTag(tags, raw) {
  const tag = cleanTag(raw);
  const list = tags || [];
  if (!tag || list.length >= MAX_TAGS || list.some((t) => same(t, tag))) return list;
  return [...list, tag];
}

export function removeTag(tags, tag) {
  return (tags || []).filter((t) => !same(t, tag));
}

// Every tag the person has used, most-used first (ties alphabetical), with the
// spelling they used most. This is the filter row and the "pick one you already
// have" suggestions — their own list, no preset categories to manage.
export function allTags(recipes) {
  const counts = new Map(); // lower-case -> { total, spellings: Map }
  for (const r of recipes || []) {
    for (const t of r.tags || []) {
      const key = t.toLowerCase();
      const entry = counts.get(key) || { total: 0, spellings: new Map() };
      entry.total += 1;
      entry.spellings.set(t, (entry.spellings.get(t) || 0) + 1);
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .map((e) => ({ tag: [...e.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0], total: e.total }))
    .sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag))
    .map((e) => e.tag);
}

// Suggestions while typing: their own tags that start with (or contain) what has
// been typed and aren't already on this recipe.
export function suggestTags(all, current, typed, limit = 6) {
  const q = squash(typed).toLowerCase();
  const have = new Set((current || []).map((t) => t.toLowerCase()));
  const pool = (all || []).filter((t) => !have.has(t.toLowerCase()));
  if (!q) return pool.slice(0, limit);
  const starts = pool.filter((t) => t.toLowerCase().startsWith(q));
  const contains = pool.filter((t) => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
  return [...starts, ...contains].slice(0, limit);
}

// "10m prep", "1h prep", "1h 5m prep" — or '' when none was entered.
export function prepLabel(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return '';
  const h = Math.floor(n / 60), m = Math.round(n % 60);
  return `${h ? `${h}h` : ''}${h && m ? ' ' : ''}${m ? `${m}m` : ''} prep`;
}

// What a field's text means as minutes: '' -> null, junk -> null, capped at a day.
export function parsePrepMinutes(text) {
  const n = Math.round(Number(String(text ?? '').trim()));
  if (!String(text ?? '').trim() || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(1440, n);
}

export const QUICK_MINUTES = 15;

export function perServing(recipe) {
  const totals = sumFoodItems(recipe.items || []);
  return scaleFood(totals, 1 / (Number(recipe.servings) || 1));
}

// "High protein" is worked out from the numbers (25 g per serving, or a third of
// the calories), so it never needs typing in and never goes stale.
export function isHighProtein(recipe) {
  const p = perServing(recipe);
  return p.protein >= 25 || (p.cal > 0 && p.protein >= 15 && (p.protein * 4) / p.cal >= 0.3);
}

// The filter chips on the Recipes page. `tag` is a person's own tag, or one of
// the built-ins: 'favourites', 'high-protein', 'quick'.
export const BUILT_IN_FILTERS = [
  { id: 'favourites', label: 'Favourites' },
  { id: 'high-protein', label: 'High protein' },
  { id: 'quick', label: `Quick (<${QUICK_MINUTES}m)` },
];

export function matchesFilter(recipe, filter) {
  if (!filter || filter === 'all') return true;
  if (filter === 'favourites') return !!recipe.favourite;
  if (filter === 'high-protein') return isHighProtein(recipe);
  if (filter === 'quick') return recipe.prep_minutes != null && recipe.prep_minutes <= QUICK_MINUTES;
  return (recipe.tags || []).some((t) => same(t, filter));
}

export function filterRecipes(recipes, { query = '', filter = 'all' } = {}) {
  const q = squash(query).toLowerCase();
  return (recipes || []).filter((r) => matchesFilter(r, filter)
    && (!q || r.name.toLowerCase().includes(q) || (r.tags || []).some((t) => t.toLowerCase().includes(q))));
}

// Which built-in chips are worth showing: only ones that would match something.
export function visibleBuiltIns(recipes) {
  return BUILT_IN_FILTERS.filter((f) => (recipes || []).some((r) => matchesFilter(r, f.id)));
}

export const SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'name', label: 'A to Z' },
  { id: 'calories', label: 'Calories' },
  { id: 'protein', label: 'Protein' },
];

// Does not change the order it is given for 'recent' (the list arrives newest first).
export function sortRecipes(recipes, sortId) {
  const list = [...(recipes || [])];
  if (sortId === 'name') return list.sort((a, b) => a.name.localeCompare(b.name));
  if (sortId === 'calories') return list.sort((a, b) => perServing(a).cal - perServing(b).cal);
  if (sortId === 'protein') return list.sort((a, b) => perServing(b).protein - perServing(a).protein);
  return list;
}

// The recipe logged most recently. `logs` are food_logs rows for logged recipes
// (they store the recipe's name, not its id), newest first; a name shared by two
// recipes picks the newer one.
export function featuredRecipe(recipes, logs) {
  const byName = new Map();
  for (const r of recipes || []) { const k = r.name.trim().toLowerCase(); if (!byName.has(k)) byName.set(k, r); }
  for (const l of logs || []) {
    const hit = byName.get(String(l.food_name || '').trim().toLowerCase());
    if (hit) return hit;
  }
  return null;
}
