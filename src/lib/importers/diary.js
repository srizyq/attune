// Turns the CSV files from another tracker's "export my data" into Attune
// entries. It reads columns by *meaning* (a list of accepted header names for
// each field) rather than by one app's exact layout, because export formats
// change and differ between app versions, languages and subscription tiers —
// so the same code reads MyFitnessPal, Cronometer, Lose It and any similar
// diary with a date, a food name (optional) and calories.
//
// Nothing here talks to the network or the database: files in, plain objects
// out, so the preview can show exactly what will be written before anything is.
import { parseCsvObjects } from './csv';

// ── headers ────────────────────────────────────────────────────────────────
// "Carbohydrates (g)" → { key: 'carbohydrates', unit: 'g' }; "Energy (kcal)" →
// { key: 'energy', unit: 'kcal' }. Keys are lowercased with everything that
// isn't a letter or digit removed.
export function headerInfo(raw) {
  const text = String(raw ?? '');
  const unitMatch = text.match(/\(([^)]*)\)/);
  const unit = unitMatch ? unitMatch[1].trim().toLowerCase().replace('µ', 'u') : null;
  const key = text.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return { key, unit };
}

// Accepted header keys per field, most specific first.
const ALIASES = {
  date: ['date', 'day', 'logdate', 'entrydate', 'loggeddate', 'diarydate'],
  time: ['time', 'timeofday', 'loggedtime'],
  name: ['foodname', 'food', 'name', 'item', 'itemname', 'fooditem', 'description', 'foodnamedescription'],
  meal: ['meal', 'mealtype', 'mealname', 'group', 'type', 'mealgroup'],
  calories: ['calories', 'energy', 'energykcal', 'kcal', 'calorie', 'cal'],
  protein: ['protein', 'proteins'],
  carbs: ['carbohydrates', 'carbs', 'carbohydrate', 'totalcarbohydrates', 'totalcarbs'],
  fat: ['fat', 'totalfat', 'fats'],
  fibre: ['fibre', 'fiber', 'dietaryfibre', 'dietaryfiber'],
  sugar: ['sugars', 'sugar', 'totalsugars'],
  sodium: ['sodium', 'salt'],
  saturatedFat: ['saturatedfat', 'saturated', 'saturatedfattyacids', 'satfat'],
  cholesterol: ['cholesterol'],
  potassium: ['potassium'],
  calcium: ['calcium'],
  iron: ['iron'],
  quantity: ['quantity', 'amount', 'servings', 'servingsize', 'qty'],
  units: ['units', 'unit', 'servingunit'],
  weight: ['weight', 'bodyweight', 'weightkg', 'weightlbs', 'weightlb'],
  metric: ['metric', 'measurement', 'biometric'],
};

function buildColumnMap(headers) {
  const infos = headers.map((h) => ({ raw: h, ...headerInfo(h) }));
  const map = {};
  for (const [field, keys] of Object.entries(ALIASES)) {
    for (const key of keys) {
      const hit = infos.find((i) => i.key === key && !Object.values(map).some((m) => m.raw === i.raw));
      if (hit) { map[field] = hit; break; }
    }
  }
  return map;
}

// ── values ─────────────────────────────────────────────────────────────────
// "1,234.5" → 1234.5; "12,5" (decimal comma) → 12.5; "" / "-" / "n/a" → null.
export function parseNumber(value) {
  let s = String(value ?? '').trim();
  if (s === '' || /^(-|—|–|n\/?a|null|none)$/i.test(s)) return null;
  s = s.replace(/[^\d.,\-+eE]/g, '');
  if (s === '') return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Both present: whichever comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Only commas: "1,234" is a thousands separator, "12,5" a decimal comma.
    s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Convert a number in a header's own unit to the unit Attune stores.
const MASS_TO_MG = { g: 1000, mg: 1, mcg: 0.001, ug: 0.001 };
function toMg(value, unit) {
  if (value == null) return null;
  const factor = MASS_TO_MG[unit ?? 'mg'];
  return value * (factor ?? 1);
}
function toGrams(value, unit) {
  if (value == null) return null;
  const factor = MASS_TO_MG[unit ?? 'g'];
  return factor == null ? value : (value * factor) / 1000;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n) { return String(n).padStart(2, '0'); }
function validYmd(y, m, d) {
  if (y < 1990 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function fullYear(y) { return y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y; }

// → { date: 'YYYY-MM-DD' | null, ambiguous: boolean }. `order` only matters for
// numeric day/month dates where both parts could be either (05/03/2026).
export function parseDate(value, order = 'dmy') {
  const s = String(value ?? '').trim();
  if (!s) return { date: null, ambiguous: false };
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
  if (m) return { date: validYmd(+m[1], +m[2], +m[3]), ambiguous: false };
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[T\s].*)?$/);
  if (m) {
    const a = +m[1], b = +m[2], y = fullYear(+m[3]);
    if (a > 12 && b <= 12) return { date: validYmd(y, b, a), ambiguous: false };
    if (b > 12 && a <= 12) return { date: validYmd(y, a, b), ambiguous: false };
    const ambiguous = a !== b && a <= 12 && b <= 12;
    return { date: order === 'mdy' ? validYmd(y, a, b) : validYmd(y, b, a), ambiguous };
  }
  // "5 Mar 2026", "5 March 2026", "Mar 5, 2026", "March 5 2026"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    return { date: mi > -1 ? validYmd(+m[3], mi + 1, +m[1]) : null, ambiguous: false };
  }
  m = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return { date: mi > -1 ? validYmd(+m[3], mi + 1, +m[2]) : null, ambiguous: false };
  }
  return { date: null, ambiguous: false };
}

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'];

// Meal text → Attune meal; falls back to the time of day, then snacks.
export function mapMeal(text, time) {
  const t = String(text ?? '').toLowerCase();
  if (/breakfast/.test(t)) return 'breakfast';
  if (/brunch|lunch/.test(t)) return 'lunch';
  if (/dinner|supper|evening/.test(t)) return 'dinner';
  if (/snack/.test(t)) return 'snacks';
  const hm = String(time ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (hm) {
    const h = +hm[1];
    if (h < 11) return 'breakfast';
    if (h < 15) return 'lunch';
    if (h < 21) return 'dinner';
  }
  return 'snacks';
}

const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };

// ── a single file ──────────────────────────────────────────────────────────
const FUTURE_SLACK_DAYS = 1;

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function classify(map) {
  if (!map.date) return 'other';
  if (map.calories) return 'food';
  if (map.metric && (map.quantity || map.weight)) return 'biometrics';
  if (map.weight) return 'weight';
  return 'other';
}

// What app a file looks like, for the preview only (parsing doesn't depend on it).
export function guessSource(headers, map) {
  const keys = headers.map((h) => headerInfo(h).key);
  const has = (k) => keys.includes(k);
  if (has('foodname') && has('group') && has('category')) return 'Cronometer';
  if (has('type') && has('units') && has('quantity') && has('name')) return 'Lose It';
  if (has('meal') && (has('calories') || has('energy')) && has('date')) return 'MyFitnessPal';
  if (map.calories && map.date && !map.name && !map.meal) return 'Daily totals';
  return 'CSV file';
}

function weightUnitFrom(headerUnit, headerKey, unitCell, fallback) {
  const probe = `${headerUnit ?? ''} ${headerKey ?? ''} ${unitCell ?? ''}`.toLowerCase();
  if (/\b(lb|lbs|pound|pounds)\b|lbs?$/.test(probe)) return 'lb';
  if (/\b(kg|kgs|kilo|kilogram|kilograms)\b|kgs?$/.test(probe)) return 'kg';
  return fallback;
}

// A weight file/rows: { date, weight, unit }.
function parseWeightRows(records, map, ctx, skip) {
  const out = [];
  for (const rec of records) {
    if (map.metric && !/weight/i.test(rec[map.metric.raw] ?? '')) { skip('not a weight measurement'); continue; }
    const weightCell = rec[(map.metric ? (map.quantity || map.weight) : map.weight).raw];
    const unitCell = map.units ? rec[map.units.raw] : null;
    const w = parseNumber(weightCell);
    const { date } = parseDate(rec[map.date.raw], ctx.order);
    if (w == null || w <= 0) { skip('no weight value'); continue; }
    if (!date) { skip('weight with no readable date'); continue; }
    const hdr = map.weight || map.quantity;
    const unit = weightUnitFrom(hdr?.unit, hdr?.key, unitCell, ctx.defaultWeightUnit);
    const kg = unit === 'lb' ? w * 0.453592 : w;
    if (kg < 20 || kg > 400) { skip('weight outside a plausible range'); continue; }
    out.push({ date, weight: Math.round(w * 10) / 10, unit });
  }
  return out;
}

function foodName(rec, map, meal) {
  let name = map.name ? (rec[map.name.raw] ?? '').trim() : '';
  if (!name) return `${MEAL_LABEL[meal]} (imported)`;
  // Keep the portion when the file gives one, so "2 cup" isn't lost.
  const qty = map.quantity ? (rec[map.quantity.raw] ?? '').trim() : '';
  const unit = map.units ? (rec[map.units.raw] ?? '').trim() : '';
  const portion = [qty, unit].filter(Boolean).join(' ');
  if (portion && !/^1(\.0+)?$/.test(qty) && portion.length <= 20 && !name.includes(portion)) name = `${name} (${portion})`;
  return name.slice(0, 200);
}

const MAX_CALORIES_PER_ROW = 20000;

function parseFoodRows(records, map, ctx, skip) {
  const out = [];
  const today = ctx.today;
  const latest = addDays(today, FUTURE_SLACK_DAYS);
  const onlyTotals = !map.name && !map.meal;
  for (const rec of records) {
    const nameRaw = map.name ? (rec[map.name.raw] ?? '').trim() : '';
    const mealRaw = map.meal ? (rec[map.meal.raw] ?? '').trim() : '';
    if (/^total/i.test(nameRaw) || /^total/i.test(mealRaw) || /^(daily )?total:?$/i.test(nameRaw)) { skip('total rows'); continue; }
    if (map.meal && /exercise|workout|cardio|strength/i.test(mealRaw)) { skip('exercise entries'); continue; }

    const { date, ambiguous } = parseDate(rec[map.date.raw], ctx.order);
    if (ambiguous) ctx.noteAmbiguous();
    if (!rec[map.date.raw]) { skip('no date'); continue; }
    if (!date) { skip('date not readable'); continue; }
    if (date > latest) { skip('dates in the future'); continue; }

    let calories = parseNumber(rec[map.calories.raw]);
    if (calories != null && map.calories.unit === 'kj') calories /= 4.184;
    const protein = parseNumber(rec[map.protein?.raw]);
    const carbs = parseNumber(rec[map.carbs?.raw]);
    const fat = parseNumber(rec[map.fat?.raw]);
    if ((calories == null || calories === 0) && !(protein > 0) && !(carbs > 0) && !(fat > 0)) { skip('no calories or macros'); continue; }
    if (calories != null && (calories < 0 || calories > MAX_CALORIES_PER_ROW)) { skip('calories outside a plausible range'); continue; }

    const meal = mapMeal(mealRaw, map.time ? rec[map.time.raw] : '');
    const g = (field) => {
      const v = parseNumber(rec[map[field]?.raw]);
      return v == null || v < 0 ? 0 : toGrams(v, map[field].unit);
    };
    const mg = (field) => {
      const v = parseNumber(rec[map[field]?.raw]);
      return v == null || v < 0 ? 0 : toMg(v, map[field].unit);
    };
    // Salt is not sodium: ~40% of salt by mass is sodium.
    const sodium = map.sodium?.key === 'salt' ? mg('sodium') * 0.4 : mg('sodium');
    out.push({
      loggedDate: date,
      meal,
      name: onlyTotals ? 'Daily total (imported)' : foodName(rec, map, meal),
      cal: Math.round(calories ?? (4 * (protein || 0) + 4 * (carbs || 0) + 9 * (fat || 0))),
      protein: Math.max(0, protein || 0),
      carbs: Math.max(0, carbs || 0),
      fat: Math.max(0, fat || 0),
      fibre: g('fibre'),
      sugar: g('sugar'),
      sodium: Math.round(sodium),
      saturatedFat: g('saturatedFat'),
      cholesterol: Math.round(mg('cholesterol')),
      potassium: Math.round(mg('potassium')),
      calcium: Math.round(mg('calcium')),
      iron: Math.round(mg('iron') * 10) / 10,
    });
  }
  return out;
}

// ── a set of files ─────────────────────────────────────────────────────────
// files: [{ name, text }]. options: { today: 'YYYY-MM-DD', defaultWeightUnit,
// dateOrder: 'auto' | 'dmy' | 'mdy' }.
export function parseImportFiles(files, { today, defaultWeightUnit = 'kg', dateOrder = 'auto' } = {}) {
  const skipped = new Map();
  const skip = (reason) => skipped.set(reason, (skipped.get(reason) || 0) + 1);
  const fileSummaries = [];
  const entries = [];
  const weights = [];
  let sawAmbiguous = false;
  let sawUnambiguousOrder = null; // 'dmy' | 'mdy' from a date like 25/03/2026

  // First pass over each file's dates settles day/month order for the whole set.
  const parsedFiles = files.map((f) => {
    const { headers, records } = parseCsvObjects(f.text);
    const map = buildColumnMap(headers);
    return { f, headers, records, map, kind: classify(map) };
  });
  if (dateOrder === 'auto') {
    for (const pf of parsedFiles) {
      if (!pf.map.date || sawUnambiguousOrder) continue;
      for (const rec of pf.records) {
        const m = String(rec[pf.map.date.raw] ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/);
        if (!m) continue;
        if (+m[1] > 12 && +m[2] <= 12) { sawUnambiguousOrder = 'dmy'; break; }
        if (+m[2] > 12 && +m[1] <= 12) { sawUnambiguousOrder = 'mdy'; break; }
      }
    }
  }
  const order = dateOrder !== 'auto' ? dateOrder : (sawUnambiguousOrder || 'dmy');

  for (const pf of parsedFiles) {
    const ctx = {
      today, order, defaultWeightUnit,
      noteAmbiguous: () => { sawAmbiguous = true; },
    };
    const source = guessSource(pf.headers, pf.map);
    if (pf.kind === 'food') {
      const rows = parseFoodRows(pf.records, pf.map, ctx, skip);
      entries.push(...rows);
      fileSummaries.push({ name: pf.f.name, kind: 'food', source, rows: rows.length });
    } else if (pf.kind === 'weight' || pf.kind === 'biometrics') {
      const rows = parseWeightRows(pf.records, pf.map, ctx, skip);
      weights.push(...rows);
      fileSummaries.push({ name: pf.f.name, kind: 'weight', source: source === 'CSV file' ? 'Weight log' : source, rows: rows.length });
    } else {
      fileSummaries.push({ name: pf.f.name, kind: 'ignored', source, rows: 0 });
    }
  }

  // One weigh-in per date (the last one in the file wins).
  const weightByDate = new Map();
  for (const w of weights) weightByDate.set(w.date, w);
  const weightRows = [...weightByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  entries.sort((a, b) => a.loggedDate.localeCompare(b.loggedDate));

  const dates = entries.map((e) => e.loggedDate);
  const days = new Set(dates);
  return {
    entries,
    weights: weightRows,
    files: fileSummaries,
    skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    days: [...days].sort(),
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
    // Day/month order was a guess because every date was readable either way.
    dateOrder: order,
    dateOrderGuessed: dateOrder === 'auto' && sawAmbiguous && !sawUnambiguousOrder,
  };
}
