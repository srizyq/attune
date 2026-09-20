// The single source of truth for what a connected coach can see and do.
// Both the consent card a client accepts and the one-time notice for
// pre-consent connections render from these lists — so when a feature that
// widens a coach's access ships (workouts, photos, meal plans…), adding a line
// here is what keeps the consent screen honest. Keep it in step with the
// trainer-read RLS policies in supabase/schema.sql.
export const COACH_CAN_SEE = [
  { icon: 'ti-tools-kitchen-2', text: 'Everything you log: foods, meals and their nutrients' },
  { icon: 'ti-scale', text: 'Your weight history' },
  { icon: 'ti-barbell', text: 'Your workouts' },
  { icon: 'ti-mood-smile', text: 'Your daily check-ins: mood, energy, water and notes' },
  { icon: 'ti-user', text: 'Your profile: goal, body stats and targets' },
];

export const COACH_CAN_DO = [
  { icon: 'ti-message-circle', text: 'Message you and leave notes' },
  { icon: 'ti-target', text: 'Change your calorie and macro targets' },
  { icon: 'ti-bookmark', text: 'Add recipes to your saved meals' },
];

export const COACH_REASSURANCE = 'You can disconnect at any time, and they lose access immediately.';
