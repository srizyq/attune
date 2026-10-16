// Who owns a client's calorie and macro targets. A coach who sets them is
// recorded in profiles.targets_set_by (see set_client_targets in schema.sql);
// while that coach is still the client's active coach, the client's own
// Settings page leaves those numbers alone instead of silently re-deriving
// (and rounding) them. The client can take them back, which tells the coach.

// The active coach link whose trainer owns the targets, or null — a coach who
// has since been disconnected no longer owns anything, so a client is never
// stuck behind a lock held by someone who can't see their data any more.
export function coachOwnerOf(profile, activeLinks = []) {
  const id = profile?.targets_set_by;
  if (!id) return null;
  return activeLinks.find((l) => l.trainer?.id === id)?.trainer ?? null;
}

// Locked while the owning coach is still connected. While coaches are still
// loading and a coach is recorded, stay locked: unlocking for a moment would
// let an autosave overwrite the coach's numbers before we know.
export function targetsLockedByCoach(profile, activeLinks, loading) {
  if (!profile?.targets_set_by) return false;
  return loading || !!coachOwnerOf(profile, activeLinks);
}

const n = (v) => Number(v) || 0;

// The numbers as the coach set them, exactly (no re-derivation from percentages).
export function storedTargets(profile) {
  if (!profile?.calorie_target) return null;
  return { calories: n(profile.calorie_target), protein_g: n(profile.protein_g), carbs_g: n(profile.carbs_g), fat_g: n(profile.fat_g) };
}

export const describeTargets = (t) => (t
  ? `${t.calories.toLocaleString()} kcal · P ${t.protein_g}g · C ${t.carbs_g}g · F ${t.fat_g}g`
  : 'no calorie target');

// The note the coach receives (in their message thread with the client) when
// the client takes the targets back — clearly automatic, with what they were.
export function takeoverMessage(targets) {
  return `Heads up — I've taken over my own calorie and macro targets in Settings. They were ${describeTargets(targets)}. (Sent automatically.)`;
}

export const shortDate = (iso, locale = 'en-AU') =>
  (iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '');
