// Extra fields the photo and menu scans now ask the model for, to fill the
// richer result pages (an insight sentence, per-item match %, a menu's
// restaurant name / prices / tips). The model's JSON is untrusted in shape, so
// everything is clamped and trimmed here before it reaches the app, and every
// field is optional: a reply without them still works, the UI just hides the
// block. (Underscore-prefixed so it isn't counted as a Vercel function.)

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pct = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : null;
};

// Photo scan: top-level `insight`, and per-ingredient `match` + `portion`.
export function sanitizePhotoExtras(parsed) {
  const insight = str(parsed?.insight, 220);
  const ingredients = (Array.isArray(parsed?.ingredients) ? parsed.ingredients : []).map((ing) => {
    const out = { ...ing };
    const match = pct(ing?.match);
    if (match == null) delete out.match; else out.match = match;
    const portion = str(ing?.portion, 40);
    if (portion) out.portion = portion; else delete out.portion;
    return out;
  });
  const out = { ...parsed, ingredients };
  if (insight) out.insight = insight; else delete out.insight;
  return out;
}

// A printed price, kept as text so the currency symbol survives ("$34",
// "£12.50", "12"). Must contain a digit, or it is dropped.
function price(v) {
  const s = str(typeof v === 'number' ? String(v) : v, 14);
  return /\d/.test(s) ? s : '';
}

// Menu scan: top-level `restaurant` + `advice`; items get `price`;
// recommendations get `match`, `tip` and `price`.
export function sanitizeMenuExtras(parsed) {
  const out = { ...parsed };
  const restaurant = str(parsed?.restaurant, 60);
  if (restaurant) out.restaurant = restaurant; else delete out.restaurant;
  const advice = str(parsed?.advice, 260);
  if (advice) out.advice = advice; else delete out.advice;

  if (Array.isArray(parsed?.items)) {
    out.items = parsed.items.map((item) => {
      const next = { ...item };
      const p = price(item?.price);
      if (p) next.price = p; else delete next.price;
      return next;
    });
  }
  if (Array.isArray(parsed?.recommendations)) {
    out.recommendations = parsed.recommendations.map((rec) => {
      const next = { ...rec };
      const match = pct(rec?.match);
      if (match == null) delete next.match; else next.match = match;
      const tip = str(rec?.tip, 140);
      if (tip) next.tip = tip; else delete next.tip;
      const p = price(rec?.price);
      if (p) next.price = p; else delete next.price;
      return next;
    });
  }
  return out;
}
