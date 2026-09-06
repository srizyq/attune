// Common Australian food slang/abbreviations that won't literally appear
// in any food database's actual naming — "maccas" isn't in FatSecret,
// AFCD, or Open Food Facts under that name, "mcdonald's" is. Expanding
// before search means someone typing the way they actually talk still
// finds a real match instead of relying on the AI-estimate fallback for
// something that genuinely exists in the data, just under a different name.
const FOOD_SLANG = {
  maccas: 'mcdonalds',
  "macca's": 'mcdonalds',
  maca: 'mcdonalds',
  hjs: 'hungry jacks',
  "hungry jack's": 'hungry jacks',
  kfc: 'kentucky fried chicken',
  bk: 'burger king',
  subs: 'subway',
  servo: 'service station',
  sanga: 'sandwich',
  sangas: 'sandwiches',
  snag: 'sausage',
  snags: 'sausages',
  choccy: 'chocolate',
  brekky: 'breakfast',
  brekkie: 'breakfast',
  hsp: 'halal snack pack',
};

// Word-level, not whole-string — "maccas big mac" should expand to
// "mcdonalds big mac", not fail to match because the phrase as a whole
// isn't a dictionary entry.
export function expandFoodSlang(query) {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  let changed = false;
  const expanded = words.map(w => {
    if (FOOD_SLANG[w]) {
      changed = true;
      return FOOD_SLANG[w];
    }
    return w;
  });
  return changed ? expanded.join(' ') : null;
}
