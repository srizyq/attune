// 30-day, no-card-required Pro trial, starting when an account attaches
// real credentials (not at anonymous/guest creation — see schema.sql's
// trial_ends_at comment for why, and onboarding/Step4.jsx +
// Profile.jsx's UpgradeForm for the two places that set it).
//
// Shared between the client (useProfile.js, so the UI shows Pro features
// during the trial) and every server-side Pro gate in api/ that reads
// profiles.is_premium directly (the photo/label/menu scan endpoints) —
// same reasoning as compGrants.js, and the same mistake to avoid: a
// trial only the client knew about would mean a trialing account sees
// Pro in the UI but still hits the server's real free-scan limit. No
// framework/browser-specific syntax here (no import.meta, no JSX) since
// Vercel's serverless functions bundle this file directly from api/.
export const TRIAL_DAYS = 30;

export function isTrialActive(profile) {
  return !!profile?.trial_ends_at && new Date(profile.trial_ends_at) > new Date();
}

// Whole days remaining, rounded up — "23 hours left" should still read as
// "1 day left", not "0 days left" (which reads as already-over).
export function trialDaysLeft(profile) {
  if (!isTrialActive(profile)) return 0;
  const ms = new Date(profile.trial_ends_at).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 86400000));
}

// A trial that ran out without ever becoming a real subscription — used
// to show the "trial ended, upgrade to keep Pro" prompt exactly once per
// account (not for an account that never had a trial at all, and not for
// one whose trial ended because they're now a real paying subscriber).
export function trialJustEnded(profile) {
  return !!profile?.trial_ends_at && !profile?.is_premium && new Date(profile.trial_ends_at) <= new Date();
}

export function withTrial(profile) {
  return profile && isTrialActive(profile) ? { ...profile, is_premium: true } : profile;
}
