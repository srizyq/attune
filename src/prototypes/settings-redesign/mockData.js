// Shared realistic mock state — same shape/values across all three
// variants so the picker is comparing layout, not data.
export function useMockSettings() {
  return {
    name: 'Sriram', isGuest: true, daysRemaining: 7, isPremium: false,
    goal: 'lose', activity: 'moderate',
    calMode: 'calculated', calories: 2182,
    proteinPct: 35, fatPct: 25,
    reminderOn: true, reminderTime: '19:00',
    coachPass: false, coachMode: false,
    theme: 'dark',
  };
}

export const GOAL_OPTIONS = [
  { value: 'lose', icon: 'ti-trending-down', label: 'Lose weight', desc: '−400 kcal/day' },
  { value: 'maintain', icon: 'ti-scale', label: 'Maintain', desc: 'At maintenance' },
  { value: 'build', icon: 'ti-barbell', label: 'Build muscle', desc: '+300 kcal/day' },
];

export const pageShellStyle = {
  minHeight: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)',
  fontFamily: "'DM Sans', sans-serif", paddingBottom: 80,
};
