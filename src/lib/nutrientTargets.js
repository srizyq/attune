import { MICRO_NUTRIENTS } from './microNutrients';

// Daily nutrient targets for one person. In order of priority:
//   1. a target they (or their trainer) set themselves (profile.micro_targets),
//   2. the recommended intake for their age and sex — and pregnancy or
//      breastfeeding — from the Australian & NZ Nutrient Reference Values
//      (NHMRC), with the US NIH adequate intake for choline, which the NRVs
//      don't set,
//   3. the app's general guideline (defaultTarget in microNutrients.js).
//
// Each row is 6 age bands for men then women — 9–13, 14–18, 19–30, 31–50,
// 51–70, 71+ — and 3 bands (14–18, 19–30, 31–50) for pregnancy and
// breastfeeding. A one-element array means "the same in every band".
// Values are the RDI where one exists, otherwise the adequate intake (AI) or
// suggested dietary target (SDT).
const BANDS = [[9, 13], [14, 18], [19, 30], [31, 50], [51, 70], [71, 200]];
const EVEN = (v) => [v, v, v, v, v, v];

export const NRV = {
  calcium: { m: [1000, 1300, 1000, 1000, 1000, 1300], f: [1000, 1300, 1000, 1000, 1300, 1300], preg: [1300, 1000, 1000], lact: [1300, 1000, 1000] },
  iron: { m: [8, 11, 8, 8, 8, 8], f: [8, 15, 18, 18, 8, 8], preg: [27, 27, 27], lact: [10, 9, 9] },
  magnesium: { m: [240, 410, 400, 420, 420, 420], f: [240, 360, 310, 320, 320, 320], preg: [400, 350, 360], lact: [360, 310, 320] },
  zinc: { m: [8, 13, 14, 14, 14, 14], f: [8, 9, 8, 8, 8, 8], preg: [12, 11, 11], lact: [13, 12, 12] },
  vitaminA: { m: [600, 900, 900, 900, 900, 900], f: [600, 700, 700, 700, 700, 700], preg: [800, 800, 800], lact: [1100, 1100, 1100] },
  vitaminC: { m: [35, 40, 45, 45, 45, 45], f: [35, 40, 45, 45, 45, 45], preg: [60], lact: [85] },
  vitaminB12: { m: [1.8, 2.4, 2.4, 2.4, 2.4, 2.4], f: [1.8, 2.4, 2.4, 2.4, 2.4, 2.4], preg: [2.6], lact: [2.8] },
  folate: { m: [300, 400, 400, 400, 400, 400], f: [300, 400, 400, 400, 400, 400], preg: [600], lact: [500] },
  vitaminD: { m: [5, 5, 5, 5, 10, 15], f: [5, 5, 5, 5, 10, 15], preg: [5], lact: [5] },
  potassium: { m: [3000, 3600, 3800, 3800, 3800, 3800], f: [2500, 2600, 2800, 2800, 2800, 2800], preg: [2800], lact: [3200] },
  fibre: { m: [24, 28, 30, 30, 30, 30], f: [20, 22, 25, 25, 25, 25], preg: [28], lact: [30] },
  thiamin: { m: [0.9, 1.2, 1.2, 1.2, 1.2, 1.2], f: [0.9, 1.1, 1.1, 1.1, 1.1, 1.1], preg: [1.4], lact: [1.4] },
  riboflavin: { m: [0.9, 1.3, 1.3, 1.3, 1.3, 1.6], f: [0.9, 1.1, 1.1, 1.1, 1.1, 1.3], preg: [1.4], lact: [1.6] },
  niacin: { m: [12, 16, 16, 16, 16, 16], f: [12, 14, 14, 14, 14, 14], preg: [18], lact: [17] },
  vitaminB6: { m: [1, 1.3, 1.3, 1.3, 1.7, 1.7], f: [1, 1.2, 1.3, 1.3, 1.5, 1.5], preg: [1.9], lact: [2] },
  vitaminE: { m: [8, 10, 10, 10, 10, 10], f: [8, 8, 7, 7, 7, 7], preg: [8, 7, 7], lact: [12, 11, 11] },
  phosphorus: { m: [1250, 1250, 1000, 1000, 1000, 1000], f: [1250, 1250, 1000, 1000, 1000, 1000], preg: [1250, 1000, 1000], lact: [1250, 1000, 1000] },
  selenium: { m: [40, 70, 70, 70, 70, 70], f: [40, 60, 60, 60, 60, 60], preg: [60, 65, 65], lact: [75] },
  iodine: { m: [120, 150, 150, 150, 150, 150], f: [120, 150, 150, 150, 150, 150], preg: [220], lact: [270] },
  omega3: { m: [400, 610, 610, 610, 610, 610], f: [400, 430, 430, 430, 430, 430], preg: [430], lact: [430] },
  alphaLinolenicAcid: { m: [1, 1.2, 1.3, 1.3, 1.3, 1.3], f: EVEN(0.8), preg: [1], lact: [1.2] },
  omega6: { m: [10, 12, 13, 13, 13, 13], f: EVEN(8), preg: [10, 8, 8], lact: [10, 8, 8] },
  vitaminK: { m: [50, 70, 70, 70, 70, 70], f: [50, 60, 60, 60, 60, 60], preg: [60], lact: [60] },
  choline: { m: [375, 550, 550, 550, 550, 550], f: [375, 400, 425, 425, 425, 425], preg: [450], lact: [550] },
  copper: { m: [1, 1.5, 1.7, 1.7, 1.7, 1.7], f: [1, 1.1, 1.2, 1.2, 1.2, 1.2], preg: [1.3], lact: [1.4] },
  manganese: { m: [3, 5, 5.5, 5.5, 5.5, 5.5], f: [2.5, 4, 5, 5, 5, 5], preg: [5], lact: [5] },
};

/** The person's age in whole years from a date of birth, or the stored age. null when unknown. */
export function ageOf(profile, today = new Date()) {
  const dob = profile?.date_of_birth;
  if (dob) {
    const d = new Date(`${String(dob).slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      let years = today.getFullYear() - d.getFullYear();
      if (today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) years -= 1;
      return years;
    }
  }
  const stored = Number(profile?.age);
  return Number.isFinite(stored) && stored > 0 ? stored : null;
}

const pick = (arr, i) => (arr.length === 1 ? arr[0] : arr[i]);
const round = (v) => Math.round(v * 100) / 100;

/** The recommended daily intake of one nutrient for a profile, or null when the person's age is unknown or under 9. */
export function recommendedFor(key, profile, today) {
  const row = NRV[key];
  const age = ageOf(profile, today);
  if (!row || age == null || age < 9) return null;
  const band = BANDS.findIndex(([lo, hi]) => age >= lo && age <= hi);
  if (band === -1) return null;
  const stage = profile?.sex === 'female' ? profile?.life_stage : null;
  if ((stage === 'pregnant' || stage === 'breastfeeding') && age >= 14 && age <= 50) {
    const arr = stage === 'pregnant' ? row.preg : row.lact;
    const i = age <= 18 ? 0 : age <= 30 ? 1 : 2;
    return arr.length === 1 ? arr[0] : arr[i] ?? arr[arr.length - 1];
  }
  const m = pick(row.m, band);
  const f = pick(row.f, band);
  if (profile?.sex === 'male') return m;
  if (profile?.sex === 'female') return f;
  return round((m + f) / 2);
}

// Limits based on a share of energy rather than a fixed amount.
function energyBased(key, profile) {
  const kcal = Number(profile?.calorie_target);
  if (!(kcal > 0)) return null;
  if (key === 'saturatedFat') return Math.round((kcal * 0.1) / 9);  // under 10% of energy
  if (key === 'addedSugar') return Math.round((kcal * 0.1) / 4);    // under 10% of energy (WHO)
  return null;
}

/**
 * Where a nutrient's target came from, for saying so on screen:
 *   'custom' (set by them or their trainer) | 'personal' (age/sex based) | 'general' (the app's guideline) | null (no target).
 */
export function targetFor(key, profile, today) {
  const custom = Number(profile?.micro_targets?.[key]);
  if (Number.isFinite(custom) && custom > 0) return { value: custom, source: 'custom' };
  const personal = recommendedFor(key, profile, today) ?? energyBased(key, profile);
  if (personal != null) return { value: personal, source: 'personal' };
  if (key === 'sodium' && ageOf(profile, today) >= 14) return { value: 2000, source: 'personal' }; // NHMRC suggested dietary target
  const general = MICRO_NUTRIENTS.find((n) => n.key === key)?.defaultTarget;
  return general ? { value: general, source: 'general' } : { value: null, source: null };
}

/** { key: number|null } for every nutrient, ready to use as a lookup. */
export function targetsFor(profile, today) {
  return Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, targetFor(n.key, profile, today).value]));
}

/** The short line under a target: who it is for. */
export function targetNote(source) {
  return source === 'custom' ? 'Your target' : source === 'personal' ? 'Recommended for you' : source === 'general' ? 'General guideline' : null;
}
