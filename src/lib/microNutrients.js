// Single source of truth for every trackable micronutrient — shared by
// Nutrients.jsx (display) and Settings.jsx (Pro custom target editor) so
// the two can't drift out of sync on units, labels, or which nutrients
// exist. `pro: true` means free users see it blurred/locked on the
// Nutrients page — that's unrelated to target *editing*, which is Pro-only
// for all 19 regardless of `pro`, since only Pro users reach the editor.
//
// `defaultTarget` is a numeric standard-adult-RDI figure (midpoint of a
// range, or the cap for a "under X" guideline) used to draw a progress
// bar even when someone hasn't set a custom target — without it, most
// cards (custom targets are Pro-only and opt-in, so most users never set
// one) had nothing but a bare number and static guideline text, which is
// what read as "empty boxes". Left undefined for the two nutrients whose
// guideline isn't a target at all ("as low as possible", "favour over
// saturated fat") — there's no meaningful "% of goal" for those.
export const MICRO_NUTRIENTS = [
  { key: 'fibre', label: 'Fibre', unit: 'g', icon: 'ti-leaf', color: 'var(--accent)', guideline: 'Guideline: 25–30g/day', defaultTarget: 28, pro: false },
  { key: 'sodium', label: 'Sodium', unit: 'mg', icon: 'ti-droplet', color: 'var(--water-blue)', guideline: 'Guideline: under 2,300mg/day', defaultTarget: 2300, pro: false },
  { key: 'sugar', label: 'Sugar', unit: 'g', icon: 'ti-candy', color: 'var(--gold)', guideline: 'Guideline: under 50g/day', defaultTarget: 50, pro: false },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g', icon: 'ti-droplet-filled', color: 'var(--gold)', guideline: 'Guideline: under 20g/day', defaultTarget: 20, pro: false },
  { key: 'transFat', label: 'Trans fat', unit: 'g', icon: 'ti-alert-triangle', color: 'var(--ai-purple)', guideline: 'Guideline: as low as possible', pro: false },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', icon: 'ti-egg', color: 'var(--water-blue)', guideline: 'Guideline: under 300mg/day', defaultTarget: 300, pro: false },
  { key: 'addedSugar', label: 'Added sugar', unit: 'g', icon: 'ti-candy', color: 'var(--gold)', guideline: 'Guideline: under 25g/day', defaultTarget: 25, pro: false },
  { key: 'potassium', label: 'Potassium', unit: 'mg', icon: 'ti-bolt', color: 'var(--accent)', guideline: 'Guideline: 2,600–3,400mg/day', defaultTarget: 3000, pro: false },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', icon: 'ti-sun', color: 'var(--gold)', guideline: 'Guideline: 15mcg/day', defaultTarget: 15, pro: false },
  { key: 'calcium', label: 'Calcium', unit: 'mg', icon: 'ti-bone', color: 'var(--water-blue)', guideline: 'Guideline: 1,000mg/day', defaultTarget: 1000, pro: false },
  { key: 'iron', label: 'Iron', unit: 'mg', icon: 'ti-droplet', color: 'var(--ai-purple)', guideline: 'Guideline: 8–18mg/day', defaultTarget: 13, pro: false },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', icon: 'ti-apple', color: 'var(--gold)', guideline: 'Guideline: 700–900mcg/day', defaultTarget: 800, pro: true },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', icon: 'ti-lemon2', color: 'var(--accent)', guideline: 'Guideline: 45mg/day', defaultTarget: 45, pro: true },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', icon: 'ti-pill', color: 'var(--ai-purple)', guideline: 'Guideline: 2.4mcg/day', defaultTarget: 2.4, pro: true },
  { key: 'folate', label: 'Folate', unit: 'mcg', icon: 'ti-seeding', color: 'var(--water-blue)', guideline: 'Guideline: 400mcg/day', defaultTarget: 400, pro: true },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', icon: 'ti-battery', color: 'var(--accent)', guideline: 'Guideline: 310–420mg/day', defaultTarget: 365, pro: true },
  { key: 'zinc', label: 'Zinc', unit: 'mg', icon: 'ti-shield', color: 'var(--gold)', guideline: 'Guideline: 8–11mg/day', defaultTarget: 9.5, pro: true },
  { key: 'polyunsaturatedFat', label: 'Polyunsaturated fat', unit: 'g', icon: 'ti-fish', color: 'var(--water-blue)', guideline: 'A source of essential fatty acids', pro: true },
  { key: 'monounsaturatedFat', label: 'Monounsaturated fat', unit: 'g', icon: 'ti-droplet-half-2', color: 'var(--ai-purple)', guideline: 'Guideline: favour over saturated fat', pro: true },
];
