// Pure helpers for coach invites — kept free of React/Supabase so they're
// unit-testable (see coachInvite.test.js).

const PENDING_KEY = 'attune_pending_invite';

// Codes are 8 characters from an unambiguous alphabet, but the older
// permanent per-trainer codes were 6, and people paste with stray spaces or
// lowercase — so this only strips and uppercases; the server decides what's
// actually valid.
export function normalizeInviteCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32);
}

// Accepts either a bare code or a whole pasted invite link
// (https://attun3.com/join/ABCD2345?utm=x) and returns just the code.
export function extractInviteCode(input) {
  const text = String(input ?? '').trim();
  const match = text.match(/\/join\/([A-Za-z0-9]+)/);
  return normalizeInviteCode(match ? match[1] : text);
}

export function inviteLink(origin, code) {
  return `${String(origin).replace(/\/+$/, '')}/join/${normalizeInviteCode(code)}`;
}

// 'redeemed' and 'revoked' win over 'expired' — an invite that was used and
// has since aged out should still read as used.
export function inviteState(invite, now = Date.now()) {
  if (invite.redeemed_at) return 'redeemed';
  if (invite.revoked_at) return 'revoked';
  if (new Date(invite.expires_at).getTime() <= now) return 'expired';
  return 'open';
}

export function daysLeft(invite, now = Date.now()) {
  const ms = new Date(invite.expires_at).getTime() - now;
  return Math.max(0, Math.ceil(ms / 86400000));
}

// A code that arrived via a /join/ link before the person had an account (or
// while logged out) survives the signup/login round trip in localStorage —
// sessionStorage wouldn't, since the email-confirmation link opens a new tab.
export function stashPendingInvite(code) {
  const clean = normalizeInviteCode(code);
  if (!clean) return;
  try { localStorage.setItem(PENDING_KEY, clean); } catch { /* storage blocked — they can still paste the code */ }
}

export function takePendingInvite() {
  try {
    const code = localStorage.getItem(PENDING_KEY);
    if (code) localStorage.removeItem(PENDING_KEY);
    return code || null;
  } catch {
    return null;
  }
}

// PostgREST answers a call to a function that doesn't exist yet (the app
// deployed before its SQL migration was run) with PGRST202 / "Could not find
// the function". Callers use this to fall back to the pre-migration
// behaviour instead of breaking the whole screen.
export function isMissingFunctionError(error) {
  if (!error) return false;
  return error.code === 'PGRST202'
    || error.code === '42883'
    || /could not find the function/i.test(error.message || '');
}
