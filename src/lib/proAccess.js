// A Coach Pass includes full Pro access for its own holder — a coach
// shouldn't need a second subscription to unlock Pro for their own personal
// tracking. This is read-time/derived, never stored: profiles.is_premium
// stays the ground truth for "has their own real/comp/trial Pro
// subscription" (what Profile.jsx's and Pricing.jsx's billing UI need to
// tell apart from Pro borrowed through coaching) — every feature GATE
// should use hasProAccess() instead of reading is_premium directly.
//
// Shared between the client and every server-side Pro gate in api/ that
// reads profiles.is_premium directly (the photo/label/menu/estimate scan
// endpoints) — same reasoning, and the same shape, as trial.js's
// withTrial/compGrants.js's withCompGrants: an account that only the
// client knew had Pro-via-coaching would see Pro in the UI but still hit
// the server's real free-scan limit.

export function hasProAccess(profile) {
  return !!profile?.is_premium || !!profile?.coach_pass;
}

export function withCoachProAccess(profile) {
  return profile && profile.coach_pass ? { ...profile, is_premium: true } : profile;
}
