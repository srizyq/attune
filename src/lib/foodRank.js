// Ordering of food-search results.
//
// Two things decide where a result lands:
//   1. how well its name matches what was typed (exact, starts-with / every
//      word present, or only some words), and
//   2. how "basic" the food is — the plain ingredient someone almost always
//      means ("Potato, peeled, raw") ahead of the cooked version, ahead of
//      dishes and products that merely contain the word ("Potato pudding",
//      "Starch, potato"). Typing "potato" should never put those above the
//      potato.
// The user's own saved foods go first among good matches.

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const RAW = /\b(raw|fresh|uncooked)\b/;
const COOKED = /\b(cooked|boiled|baked|roasted|grilled|steamed|poached|microwaved|stewed|fried|scrambled)\b/;
// Words that mean "this is a made or processed product, not the ingredient".
// Ignored when the person typed the word themselves ("potato chips").
const PRODUCT_WORDS = [
  'with', 'and', '&', 'sauce', 'soup', 'pie', 'pudding', 'cake', 'bread', 'sandwich', 'roll', 'burger', 'pizza', 'salad',
  'curry', 'stew', 'casserole', 'mix', 'dried', 'dehydrated', 'powder', 'starch', 'flour', 'chips', 'chip', 'crisps', 'fries',
  'snack', 'bar', 'dessert', 'juice', 'drink', 'cordial', 'syrup', 'jam', 'spread', 'stuffed', 'crumbed', 'battered',
  'coated', 'toffee', 'flavoured', 'flavored', 'homemade', 'commercial', 'canned', 'pickled', 'preserved', 'frozen',
  'puree', 'split', 'muffin', 'biscuit', 'cookie', 'strudel', 'turnover', 'crumble', 'sushi', 'taco', 'wrap', 'bun', 'sausage', 'oil',
];
const PRODUCT_RE = new RegExp(`(?:^|[^a-z])(${PRODUCT_WORDS.map(escapeRegExp).join('|')})(?![a-z])`, 'g');

const tokens = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);
const startsLikeAny = (token, words) => words.some((w) => token.startsWith(w));

/** 0 exact, 1 starts with the whole query, 2 has every word, 3 only some of them. */
export function foodMatchRank(name, queryLower, queryWords) {
  const n = name.toLowerCase();
  if (n === queryLower) return 0;
  if (n.startsWith(queryLower)) return 1;
  if (queryWords.every((w) => new RegExp(`\\b${escapeRegExp(w)}`, 'i').test(n))) return 2;
  return 3;
}

/**
 * 0 = the plain raw ingredient, 1 = that ingredient cooked simply,
 * 2 = a variation, 3 = a product, dish or prepared item.
 */
export function basicTier(food, queryWords) {
  // Restaurant menu items, AI-estimated dishes and anything with a brand are
  // prepared products by definition.
  if (food.source === 'restaurant-chain' || food.source === 'common-dish' || food.brand) return 3;
  const n = food.name.toLowerCase();
  const segments = n.split(',').map((s) => s.trim()).filter(Boolean);
  const head = tokens(segments[0] || '');
  if (!head.some((t) => startsLikeAny(t, queryWords))) return 3; // "Starch, potato", "Soup, potato"
  const productWords = [...n.matchAll(PRODUCT_RE)].map((m) => m[1]).filter((w) => !startsLikeAny(w, queryWords));
  if (productWords.length) return 3;
  // "Sweet potato" / "Cauliflower rice" contain the word but are a different
  // food from the one typed — one step down from "Potato, ..." / "Rice, ...".
  const sideways = startsLikeAny(head[0], queryWords) ? 0 : 1;
  let tier = 2;
  if (RAW.test(n)) tier = 0;
  else if (segments.length === 1 && tokens(n).length <= queryWords.length + 1) tier = 0; // "Potato", "Banana"
  else if (COOKED.test(n) && segments.length <= 4) tier = 1;
  return Math.min(2, tier + sideways);
}

/** Orders foods best-first for `query` and drops repeats of the same name. */
export function rankFoods(foods, query) {
  const queryLower = query.trim().toLowerCase();
  if (!queryLower) return foods;
  const queryWords = queryLower.split(/\s+/).filter(Boolean);
  const scored = foods.map((f, i) => {
    const match = foodMatchRank(f.name, queryLower, queryWords);
    const bucket = match === 0 ? 0 : match === 3 ? 2 : 1;
    return {
      f,
      i,
      mine: f.source === 'custom' && bucket <= 1 ? 0 : 1,
      bucket,
      tier: bucket === 2 ? 0 : basicTier(f, queryWords),
      starts: match <= 1 ? 0 : 1,
    };
  });
  scored.sort((a, b) => a.mine - b.mine || a.bucket - b.bucket || a.tier - b.tier || a.starts - b.starts
    || a.f.name.length - b.f.name.length || a.i - b.i);
  const seen = new Set();
  return scored.map((s) => s.f).filter((f) => {
    const key = f.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
