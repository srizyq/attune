// The "pick details" call behind the menu-scan confirm step: once someone
// taps a dish, one extra free request asks for what the list pass doesn't
// carry (portion sizes, quick tweaks, allergens, sodium, where on the photo
// the dish is). Not part of the main scan — transcribing all of that for
// every item would blow the reply budget on a long menu. The model's JSON is
// untrusted shape-wise, so everything is clamped/filtered here before it
// reaches the UI.

export const ALLERGENS = ['Dairy', 'Gluten', 'Eggs', 'Nuts', 'Peanuts', 'Soy', 'Fish', 'Shellfish', 'Sesame'];

export function detailPrompt(pick) {
  return `You already analyzed a photo of a restaurant/fast-food menu and the person has now picked this dish to log:

${JSON.stringify(pick)}

Using the same menu photo and what you know of this kind of dish, give the details needed to fine-tune what they logged.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"portions": [{"label": string, "scale": number}], "tweaks": [{"label": string, "cal": number, "protein": number, "carbs": number, "fat": number}], "allergens": [string], "sodium_mg": number, "fibre_g": number, "sugar_g": number, "source": {"quote": string, "box": [number, number, number, number] or null}}

Field notes:
- portions: 2 to 4 realistic serving sizes for THIS dish as it'd be ordered or eaten. The FIRST must be the portion the macros above already describe, with scale 1, and its label should say what that is, for example "1 regular wrap (~380g)". Others are relative to it: scale 0.5 for half, 1.3 for a large, and so on. Use sizes printed on the menu if there are any.
- tweaks: 3 to 5 simple, realistic changes someone could ask for, for example "No cheese", "Sauce on side", "Swap fries for salad". cal/protein/carbs/fat are the CHANGE versus the dish above: negative for something removed or swapped for lighter, positive for an addition. Keep each label under 30 characters. Do not repeat a modification the dish already has.
- allergens: only from this list, only those the dish likely contains: ${ALLERGENS.join(', ')}. Empty array if none.
- sodium_mg, fibre_g, sugar_g: estimates for the as-listed portion.
- source.quote: the dish's name or line exactly as printed on the menu, as it appears in the photo.
- source.box: where that printed text sits in the photo as [ymin, xmin, ymax, xmax] on a 0 to 1000 scale (0,0 = top-left of the photo). Use the JSON value null if you can't locate it confidently.`;
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function sanitizeDetail(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};

  let portions = (Array.isArray(d.portions) ? d.portions : [])
    .map((p) => ({ label: str(p?.label, 60), scale: Number(p?.scale) }))
    .filter((p) => p.label && Number.isFinite(p.scale))
    .map((p) => ({ ...p, scale: Math.min(3, Math.max(0.1, Math.round(p.scale * 100) / 100)) }))
    .slice(0, 5);
  // The first option has to be the as-listed portion, or every later scale
  // would be relative to the wrong thing.
  if (portions.length && portions[0].scale !== 1) portions[0] = { ...portions[0], scale: 1 };
  if (portions.length < 2) portions = [];

  const tweaks = (Array.isArray(d.tweaks) ? d.tweaks : [])
    .map((t) => ({
      label: str(t?.label, 40),
      cal: Math.round(num(t?.cal)),
      protein: Math.round(num(t?.protein) * 10) / 10,
      carbs: Math.round(num(t?.carbs) * 10) / 10,
      fat: Math.round(num(t?.fat) * 10) / 10,
    }))
    .filter((t) => t.label)
    .slice(0, 6);

  const allergens = (Array.isArray(d.allergens) ? d.allergens : [])
    .map((a) => ALLERGENS.find((x) => x.toLowerCase() === String(a).trim().toLowerCase()))
    .filter(Boolean)
    .filter((a, i, all) => all.indexOf(a) === i);

  const optional = (v) => (v == null || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

  let box = null;
  if (Array.isArray(d.source?.box) && d.source.box.length === 4 && d.source.box.every((n) => Number.isFinite(Number(n)))) {
    const [ymin, xmin, ymax, xmax] = d.source.box.map((n) => Math.min(1000, Math.max(0, Number(n))));
    // A sliver or an inverted box is a mis-read, not a place to crop.
    if (ymax - ymin >= 10 && xmax - xmin >= 10) box = [ymin, xmin, ymax, xmax];
  }

  return {
    portions,
    tweaks,
    allergens,
    sodium_mg: optional(d.sodium_mg),
    fibre_g: optional(d.fibre_g),
    sugar_g: optional(d.sugar_g),
    source: { quote: str(d.source?.quote, 80), box },
  };
}
