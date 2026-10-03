// Matching what someone types ("maccas", "mcdonalds", "hj's") to a restaurant
// chain, so search can offer the chain itself — and its whole menu — instead
// of only a scatter of individual items. Names alone miss how Australians
// actually say them, hence the nicknames below (keyed by restaurant_chains.id).

export const CHAIN_ALIASES = {
  'mcdonalds-au': ['maccas', 'macca', 'maccies', 'macdonalds', 'mc donalds', 'mickey ds', 'golden arches'],
  'hungry-jacks-au': ['hj', 'hjs', 'hungry jacks', 'burger king'],
  'kfc-au': ['kentucky fried chicken', 'kentucky'],
  'dominos-au': ['dominos', 'domino'],
  'guzman-y-gomez-au': ['gyg', 'guzman', 'guzman and gomez'],
  'nandos-au': ['nandos', 'nando'],
  'red-rooster-au': ['rooster'],
  'carls-jr-au': ['carls junior', 'carls jr', 'carl jr'],
  'grilld-au': ['grilld', 'grill d'],
  'bettys-burgers-au': ['bettys', 'betty burgers'],
  'chargrill-charlies-au': ['chargrill charlie', 'charlies', 'charlie chicken'],
  'the-coffee-club-au': ['coffee club'],
  'gloria-jeans-au': ['gloria jeans', 'gloria jean'],
  'hudsons-coffee-au': ['hudsons', 'hudson coffee'],
  'zarraffas-au': ['zarraffa', 'zarraffas coffee'],
  'baskin-robbins-au': ['baskin', 'baskins', '31 flavours', 'baskin robins'],
  'cold-rock-au': ['cold rock ice cream', 'coldrock'],
  'bakers-delight-au': ['bakers delight', 'baker delight', 'baker s delight'],
  'brumbys-au': ['brumby', 'brumbys bakery'],
  'michels-patisserie-au': ['michels', 'michel patisserie'],
  'muffin-break-au': ['muffin break'],
  'pie-face-au': ['pieface', 'pie face'],
  'jamaica-blue-au': ['jamaica blue'],
  'krispy-kreme-au': ['krispy', 'krispie kreme', 'krispy kremes'],
  'donut-king-au': ['donut king', 'doughnut king'],
  'boost-juice-au': ['boost', 'boost juice'],
  'noodle-box-au': ['noodlebox'],
  'salsas-au': ['salsas', 'salsa fresh mex'],
  'spudbar-au': ['spud bar'],
  'taco-bill-au': ['tacobill', 'taco bell'],
  'zambrero-au': ['zambreros'],
  'starbucks-au': ['sbux', 'starbies'],
  'pizza-hut-au': ['pizzahut'],
  'el-jannah-au': ['el janna', 'eljannah'],
  'oporto-au': ['porto'],
  'schnitz-au': ['schnitzel'],
  'chicken-treat-au': ['chickentreat'],
  'burger-urge-au': ['burgerurge'],
  'mad-mex-au': ['madmex'],
  'subway-au': ['subbies'],
  'rolld-au': ['rolld', 'rolled', 'rolls vietnamese'],
  'sumo-salad-au': ['sumo', 'sumo salad'],
  'crust-pizza-au': ['crust', 'crust pizza'],
  'pizza-capers-au': ['capers', 'pizza capers'],
  'papa-giuseppis-au': ['papa giuseppi', 'papa giuseppis', 'papas'],
  'sushi-sushi-au': ['sushi sushi'],
  'sushi-train-au': ['sushi train', 'sushitrain'],
  'go-sushi-au': ['go sushi', 'gosushi'],
  'soul-origin-au': ['soul origin', 'soulorigin'],
  'gelatissimo-au': ['gelatissimo', 'gelati'],
  'gelare-au': ['gelare'],
  'gelativo-au': ['gelativo'],
  'chatime-au': ['chatime', 'cha time', 'bubble tea'],
  'dome-au': ['dome cafe', 'dome coffee'],
  'mrs-fields-au': ['mrs fields', 'mrs field', 'mrs fields cookies'],
  'pandaroo-au': ['pandaroo'],
  'k-roo-au': ['kroo', 'k roo'],
  'mccafe-au': ['mccafe', 'mc cafe', 'maccas cafe', 'mcdonalds cafe', 'maccas coffee'],
  'wok-in-a-box-au': ['wokinabox', 'wok in a box', 'wok box'],
  'the-cheesecake-shop-au': ['cheesecake shop', 'cheesecake'],
  'banjos-bakery-cafe-au': ['banjos', 'banjo', 'banjos bakery'],
  'croissant-express-au': ['croissant express'],
  'ferguson-plarre-au': ['ferguson plarre', 'plarre', 'fergusons'],
  'burger-edge-au': ['burger edge'],
  'jesters-pies-au': ['jesters', 'jester pies'],
};

// Lower-case, drop apostrophes ("Macca's" -> "maccas"), turn every other
// symbol into a space ("Baskin-Robbins" -> "baskin robbins"), squash spaces.
export function normalizeChainText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const MIN_PREFIX = 3;

// How well one chain term (its name or a nickname) matches the typed query:
// 0 = the whole term, 1 = what's typed starts the term, 2 = starts a later
// word of it, 3 = the query contains the whole term as words ("maccas big
// mac"), null = no match.
function termScore(term, q, { allowWordPrefix }) {
  if (!term) return null;
  if (term === q) return 0;
  if (q.length >= MIN_PREFIX && term.startsWith(q)) return 1;
  if (allowWordPrefix && q.length >= MIN_PREFIX && term.includes(` ${q}`)) return 2;
  if (term.length >= 3 && (q.startsWith(`${term} `) || q.endsWith(` ${term}`) || q.includes(` ${term} `))) return 3;
  return null;
}

/**
 * Chains the query is plausibly asking for, best first. A nickname only
 * counts when it matches from its start — otherwise "chicken" would offer
 * KFC through "kentucky fried chicken" as well as the chains actually
 * named for it.
 */
export function matchChains(query, chains, limit = 3) {
  const q = normalizeChainText(query);
  if (q.length < 2 || !Array.isArray(chains)) return [];
  const scored = [];
  for (const chain of chains) {
    const name = normalizeChainText(chain.name);
    // Without its country suffix too, e.g. "mcdonalds au" is never typed.
    const candidates = [
      termScore(name, q, { allowWordPrefix: true }),
      ...(CHAIN_ALIASES[chain.id] || []).map((a) => termScore(normalizeChainText(a), q, { allowWordPrefix: false })),
    ].filter((s) => s !== null);
    if (candidates.length) scored.push({ chain, score: Math.min(...candidates) });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.chain.name.localeCompare(b.chain.name))
    .slice(0, limit)
    .map((s) => s.chain);
}

/** Menu items grouped by category, categories A-Z, uncategorised last. */
export function groupByCategory(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.category?.trim() || 'Other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups]
    .sort(([a], [b]) => (a === 'Other') - (b === 'Other') || a.localeCompare(b))
    .map(([category, list]) => ({ category, items: list }));
}
