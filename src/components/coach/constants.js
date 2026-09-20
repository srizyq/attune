// Shared constants for the trainer (Coach Mode) screens — the accent colors
// are the same hex in both themes by design.
export const ACCENT = '#8fbc8f';
export const WATER_BLUE = '#6aabcf';
export const AI_PURPLE = '#9f97e8';
export const RANGES = [{ id: 7, label: '7 days' }, { id: 30, label: '30 days' }, { id: 90, label: '90 days' }];
export const GOAL_LABELS = { lose: 'Lose weight', maintain: 'Stay balanced', build: 'Build muscle' };
export const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snacks: 'Snacks' };
// Mirrors the section layout on the client's own Nutrients page — same
// grouping, just data-driven off MICRO_NUTRIENTS here instead of one
// hardcoded MicroCard per nutrient.
export const MICRO_GROUPS = [
  { label: 'Other nutrients', keys: ['fibre', 'sodium', 'sugar'] },
  { label: 'Fat breakdown', keys: ['saturatedFat', 'transFat', 'cholesterol'] },
  { label: 'Vitamins & minerals', keys: ['addedSugar', 'potassium', 'vitaminD', 'calcium', 'iron'] },
  { label: 'More micronutrients', keys: ['vitaminA', 'vitaminC', 'vitaminB12', 'folate', 'magnesium', 'zinc', 'polyunsaturatedFat', 'monounsaturatedFat'] },
];
// Where each category routes to on the client's own app — shown as the
// picker in the composer and the tag on each posted comment.
export const COMMENT_CATEGORIES = [
  { id: 'general', label: 'General', icon: 'ti-message-circle', color: 'var(--text-muted)' },
  { id: 'weight', label: 'Weight', icon: 'ti-scale', color: ACCENT },
  { id: 'nutrition', label: 'Nutrition', icon: 'ti-clipboard-list', color: WATER_BLUE },
  { id: 'checkin', label: 'Check-in', icon: 'ti-mood-smile', color: AI_PURPLE },
];

export const fieldStyle = { width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' };
export const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

export function avg(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

// The client view's tabs, in order.
export const TABS = [
  { id: 'overview', label: 'Overview', icon: 'ti-layout-dashboard' },
  { id: 'diary', label: 'Diary', icon: 'ti-clipboard-list' },
  { id: 'progress', label: 'Progress', icon: 'ti-chart-line' },
  { id: 'messages', label: 'Messages', icon: 'ti-message-circle' },
  { id: 'plan', label: 'Plan', icon: 'ti-tools-kitchen-2' },
  { id: 'reports', label: 'Reports', icon: 'ti-file-analytics' },
];
