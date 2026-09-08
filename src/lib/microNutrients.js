// Single source of truth for every trackable micronutrient — shared by
// Nutrients.jsx (display) and Settings.jsx (Pro custom target editor) so
// the two can't drift out of sync on units, labels, or which nutrients
// exist. `pro: true` means free users see it blurred/locked on the
// Nutrients page — that's unrelated to target *editing*, which is Pro-only
// for all 19 regardless of `pro`, since only Pro users reach the editor.
export const MICRO_NUTRIENTS = [
  { key: 'fibre', label: 'Fibre', unit: 'g', icon: 'ti-leaf', color: 'var(--accent)', guideline: 'Guideline: 25–30g/day', pro: false },
  { key: 'sodium', label: 'Sodium', unit: 'mg', icon: 'ti-droplet', color: 'var(--water-blue)', guideline: 'Guideline: under 2,300mg/day', pro: false },
  { key: 'sugar', label: 'Sugar', unit: 'g', icon: 'ti-candy', color: 'var(--gold)', guideline: 'Guideline: under 50g/day', pro: false },
  { key: 'saturatedFat', label: 'Saturated fat', unit: 'g', icon: 'ti-droplet-filled', color: 'var(--gold)', guideline: 'Guideline: under 20g/day', pro: false },
  { key: 'transFat', label: 'Trans fat', unit: 'g', icon: 'ti-alert-triangle', color: 'var(--ai-purple)', guideline: 'Guideline: as low as possible', pro: false },
  { key: 'cholesterol', label: 'Cholesterol', unit: 'mg', icon: 'ti-egg', color: 'var(--water-blue)', guideline: 'Guideline: under 300mg/day', pro: false },
  { key: 'addedSugar', label: 'Added sugar', unit: 'g', icon: 'ti-candy', color: 'var(--gold)', guideline: 'Guideline: under 25g/day', pro: false },
  { key: 'potassium', label: 'Potassium', unit: 'mg', icon: 'ti-bolt', color: 'var(--accent)', guideline: 'Guideline: 2,600–3,400mg/day', pro: false },
  { key: 'vitaminD', label: 'Vitamin D', unit: 'mcg', icon: 'ti-sun', color: 'var(--gold)', guideline: 'Guideline: 15mcg/day', pro: false },
  { key: 'calcium', label: 'Calcium', unit: 'mg', icon: 'ti-bone', color: 'var(--water-blue)', guideline: 'Guideline: 1,000mg/day', pro: false },
  { key: 'iron', label: 'Iron', unit: 'mg', icon: 'ti-droplet', color: 'var(--ai-purple)', guideline: 'Guideline: 8–18mg/day', pro: false },
  { key: 'vitaminA', label: 'Vitamin A', unit: 'mcg', icon: 'ti-apple', color: 'var(--gold)', guideline: 'Guideline: 700–900mcg/day', pro: true },
  { key: 'vitaminC', label: 'Vitamin C', unit: 'mg', icon: 'ti-lemon2', color: 'var(--accent)', guideline: 'Guideline: 45mg/day', pro: true },
  { key: 'vitaminB12', label: 'Vitamin B12', unit: 'mcg', icon: 'ti-pill', color: 'var(--ai-purple)', guideline: 'Guideline: 2.4mcg/day', pro: true },
  { key: 'folate', label: 'Folate', unit: 'mcg', icon: 'ti-seeding', color: 'var(--water-blue)', guideline: 'Guideline: 400mcg/day', pro: true },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg', icon: 'ti-battery', color: 'var(--accent)', guideline: 'Guideline: 310–420mg/day', pro: true },
  { key: 'zinc', label: 'Zinc', unit: 'mg', icon: 'ti-shield', color: 'var(--gold)', guideline: 'Guideline: 8–11mg/day', pro: true },
  { key: 'polyunsaturatedFat', label: 'Polyunsaturated fat', unit: 'g', icon: 'ti-fish', color: 'var(--water-blue)', guideline: 'A source of essential fatty acids', pro: true },
  { key: 'monounsaturatedFat', label: 'Monounsaturated fat', unit: 'g', icon: 'ti-droplet-half-2', color: 'var(--ai-purple)', guideline: 'Guideline: favour over saturated fat', pro: true },
];
