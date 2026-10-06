// What people may type into Community: usernames, bios, post notes. The same
// rules the database enforces (supabase/schema.sql, "Community") so a person
// hears about a problem before they save, plus a word filter the database can't do.

export const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{1,18}[a-z0-9]$/;
export const RESERVED_USERNAMES = ['attune', 'admin', 'administrator', 'support', 'moderator', 'mod', 'staff', 'official', 'help', 'team', 'root', 'system', 'community'];
export const MIN_AGE = 16;
export const BIO_MAX = 160;
export const NOTE_MAX = 200;
export const DISPLAY_NAME_MAX = 40;

// A link in a bio: anything that looks like a web address.
const BIO_LINK_RE = /(https?:\/\/|www\.|\.com|\.net|\.org|\.io)/i;
// In a note the database only refuses full addresses; the app also catches bare domains.
const NOTE_LINK_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|app|co|me|gg)\b)/i;

export const normalizeUsername = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

/** null when the username is fine, otherwise what to tell the person. */
export function checkUsername(raw) {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'Usernames need at least 3 characters.';
  if (u.length > 20) return 'Usernames can be at most 20 characters.';
  if (!USERNAME_RE.test(u)) return 'Use letters, numbers, dots and underscores, starting and ending with a letter or number.';
  if (RESERVED_USERNAMES.includes(u)) return 'That username is reserved. Try another.';
  return null;
}

export function checkDisplayName(raw) {
  const n = String(raw || '').trim();
  if (!n) return 'Add a name people will see.';
  if (n.length > DISPLAY_NAME_MAX) return `Names can be at most ${DISPLAY_NAME_MAX} characters.`;
  return null;
}

export function checkBio(raw) {
  const t = String(raw || '');
  if (t.length > BIO_MAX) return `Keep your bio to ${BIO_MAX} characters.`;
  if (BIO_LINK_RE.test(t)) return 'Links aren\'t allowed in a bio.';
  return null;
}

export function checkNote(raw) {
  const t = String(raw || '');
  if (t.length > NOTE_MAX) return `Keep notes to ${NOTE_MAX} characters.`;
  if (NOTE_LINK_RE.test(t)) return 'Links aren\'t allowed in notes.';
  return null;
}

let matcherPromise = null;
async function profanityMatcher() {
  matcherPromise ??= import('obscenity').then(({ RegExpMatcher, englishDataset, englishRecommendedTransformers }) =>
    new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers }));
  return matcherPromise;
}

/** True when the text contains abusive language. Loads its word list on first use. */
export async function hasProfanity(text) {
  const t = String(text || '');
  if (!t.trim()) return false;
  try {
    // Don't let a slow download of the word list hold up saving.
    const matcher = await Promise.race([profanityMatcher(), new Promise((_, reject) => setTimeout(() => reject(new Error('word list timed out')), 5000))]);
    return matcher.hasMatch(t);
  } catch {
    return false; // the filter failing must not stop someone saving; reports still cover it
  }
}

/** Every problem with a set of fields, as { field: message } (empty when all fine). */
export async function validateProfileText({ username, displayName, bio }) {
  const problems = {};
  const u = checkUsername(username); if (u) problems.username = u;
  const d = checkDisplayName(displayName); if (d) problems.displayName = d;
  const b = checkBio(bio); if (b) problems.bio = b;
  if (!problems.username && await hasProfanity(normalizeUsername(username).replace(/[._]/g, ' '))) problems.username = 'Please pick a different username.';
  if (!problems.displayName && await hasProfanity(displayName)) problems.displayName = 'Please pick a different name.';
  if (!problems.bio && await hasProfanity(bio)) problems.bio = 'Please remove abusive language from your bio.';
  return problems;
}

export async function validateNote(note) {
  const n = checkNote(note);
  if (n) return n;
  if (await hasProfanity(note)) return 'Please remove abusive language from your note.';
  return null;
}

/** Age in whole years from a date of birth ('YYYY-MM-DD'), or the stored age. null when unknown. */
export function ageFromProfile(profile, today = new Date()) {
  if (profile?.date_of_birth) {
    const dob = new Date(`${profile.date_of_birth}T00:00:00`);
    if (!Number.isNaN(dob.getTime())) {
      let years = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) years -= 1;
      return years;
    }
  }
  const a = Number(profile?.age);
  return Number.isFinite(a) && a > 0 ? a : null;
}

/** 'ok', 'too_young', or 'unknown' (no age on file yet). */
export function ageGate(profile, today) {
  const age = ageFromProfile(profile, today);
  if (age == null) return 'unknown';
  return age >= MIN_AGE ? 'ok' : 'too_young';
}
