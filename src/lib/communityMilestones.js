// Streak milestones Community offers to share (7, 30, 100 days). Each is offered
// once; sharing or dismissing it is remembered on this device.
export const MILESTONES = [100, 30, 7];

const storageKey = (n) => `attune.community.milestone.${n}`;
export const isMilestoneDone = (n) => { try { return localStorage.getItem(storageKey(n)) === '1'; } catch { return false; } };
export const markMilestoneDone = (n) => { try { localStorage.setItem(storageKey(n), '1'); } catch { /* private mode: it just asks again next time */ } };

/** The biggest streak milestone reached that hasn't been shared or dismissed, or null. */
export function pendingMilestone(streak, isDone = isMilestoneDone) {
  return MILESTONES.find((n) => streak >= n && !isDone(n)) ?? null;
}
