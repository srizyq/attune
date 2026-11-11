// Every screen a signed-in user can reach, in the default (Pro, populated)
// state. `wait` is text that proves the screen actually rendered its data, so
// we never "pass" on a blank page. Other account states live in states.e2e.js,
// open modals/sheets in interactions.e2e.js, signed-out pages in public.e2e.js.
export const SCREENS = [
  { name: 'dashboard', path: '/dashboard', wait: 'TODAY' },
  { name: 'daily-log', path: '/log', wait: 'Daily log' },
  { name: 'food-search', path: '/food' },
  { name: 'recipes', path: '/recipes' },
  { name: 'nutrients', path: '/nutrients' },
  { name: 'nutrient-foods', path: '/nutrients/calcium', wait: 'Foods that supplied it' },
  { name: 'expenditure', path: '/expenditure' },
  { name: 'fasting', path: '/fasting', wait: 'Start a fast' },
  { name: 'settings', path: '/settings' },
  { name: 'settings-goals', path: '/settings/goals' },
  { name: 'coach', path: '/coach' },
  { name: 'friends', path: '/friends', wait: 'No friends yet' },
  { name: 'profile', path: '/profile' },
  { name: 'log-weight', path: '/weight/log' },
  { name: 'account', path: '/settings/personal' },
  { name: 'account-delete', path: '/settings/personal/delete' },
];

