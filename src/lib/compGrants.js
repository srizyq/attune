// These accounts always read with the listed fields forced on, regardless
// of what's actually stored — a permanent comp override rather than a
// one-off database edit, so it isn't undone by a future profile save and
// keeps working unchanged now that real Stripe billing writes these same
// fields for everyone else. Per-account grants (not one flat list) since
// not every comp account gets the same access — e.g. Pro only, without
// Coach Pass.
//
// Shared between the client (useProfile.js, so the UI shows Pro/Coach
// Pass features) and every server-side Pro/Coach gate in api/ that reads
// profiles.is_premium directly (the photo/label/menu scan endpoints) — a
// comp grant only the client knew about meant a comp'd account saw Pro in
// the UI but still hit the server's real, un-comped free-scan limit. No
// framework/browser-specific syntax here (no import.meta, no JSX) since
// Vercel's serverless functions bundle this file directly from api/.
export const COMP_GRANTS = {
  'csrreddy9@gmail.com': { is_premium: true, coach_pass: true },
  'sriramreddy1m@gmail.com': { is_premium: true, coach_pass: true },
  'nalywas@gmail.com': { is_premium: true },
  'tarunbalaji0901@gmail.com': { is_premium: true },
  'erenhdeniz@gmail.com': { is_premium: true, coach_pass: true },
};

export function withCompGrants(data, email) {
  const grants = data && email && COMP_GRANTS[email.toLowerCase()];
  return grants ? { ...data, ...grants } : data;
}
