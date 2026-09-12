// Workout calorie estimation — MET (metabolic equivalent) based, the same
// approach most calorie trackers use for a manually-logged workout with no
// wearable data behind it: kcal = MET × weight(kg) × duration(hours).
// These MET values are approximate compendium figures for each activity at
// three intensity tiers, not lab-measured for any individual — good enough
// for a reasonable estimate, not a promise. The estimate is always
// editable in the log form for exactly that reason.
export const WORKOUT_TYPES = [
  { id: 'running', label: 'Running', icon: 'ti-run', met: { light: 7, moderate: 10, intense: 14 } },
  { id: 'walking', label: 'Walking', icon: 'ti-walk', met: { light: 2.8, moderate: 3.5, intense: 5 } },
  { id: 'cycling', label: 'Cycling', icon: 'ti-bike', met: { light: 4, moderate: 8, intense: 12 } },
  { id: 'swimming', label: 'Swimming', icon: 'ti-swimming', met: { light: 4.5, moderate: 7, intense: 10 } },
  { id: 'strength', label: 'Weight training', icon: 'ti-barbell', met: { light: 3, moderate: 5, intense: 6 } },
  { id: 'yoga', label: 'Yoga', icon: 'ti-yoga', met: { light: 2.5, moderate: 3, intense: 4 } },
  { id: 'hiit', label: 'HIIT', icon: 'ti-bolt', met: { light: 6, moderate: 8, intense: 10 } },
  { id: 'sports', label: 'Sports', icon: 'ti-ball-basketball', met: { light: 4, moderate: 6, intense: 8 } },
  { id: 'other', label: 'Other', icon: 'ti-activity', met: { light: 3, moderate: 5, intense: 7 } },
];

export const INTENSITIES = [
  { id: 'light', label: 'Light' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'intense', label: 'Intense' },
];

export function weightInKg(profile) {
  const w = Number(profile?.weight) || 70;
  return profile?.unit === 'imperial' ? w * 0.453592 : w;
}

export function estimateWorkoutCalories(typeId, intensity, durationMinutes, weightKg) {
  const type = WORKOUT_TYPES.find(t => t.id === typeId) || WORKOUT_TYPES[WORKOUT_TYPES.length - 1];
  const met = type.met[intensity] || type.met.moderate;
  const hours = (Number(durationMinutes) || 0) / 60;
  return Math.round(met * weightKg * hours);
}

export function getWorkoutType(typeId) {
  return WORKOUT_TYPES.find(t => t.id === typeId) || WORKOUT_TYPES[WORKOUT_TYPES.length - 1];
}
