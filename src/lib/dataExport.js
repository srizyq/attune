// Everything of a person's that Attune holds, as one download. The point of an
// export is to be complete: a section that can't be read is reported in
// `skipped` (and shown to the person), never quietly left out.
//
// Not included, by design: private notes a coach keeps about a client (the
// database lets only that coach read them — see the privacy policy), the
// progress-photo image files themselves (listed by name here; the images stay
// in the account) and anything about other people.
import { supabase } from './supabase';
import { selectAll } from './paging';
import { getProfile, getMyTrainers } from './db';
import { EXPORT_TABLES } from './dataExportTables';

const reasonFor = (err) => {
  const code = err?.code || '';
  if (code === '42P01' || code === 'PGRST205' || /does not exist|could not find the table/i.test(err?.message || '')) return 'not available on this account yet';
  return err?.message || 'could not be read';
};

async function loadTable(def, userId) {
  return selectAll(() => {
    let q = supabase.from(def.table).select('*').eq(def.col, userId);
    for (const col of def.order) q = q.order(col, { ascending: true });
    return q;
  });
}

// Friendships have two sides; either one can be you.
async function loadFriendships(userId) {
  const [a, b] = await Promise.all([
    selectAll(() => supabase.from('friendships').select('*').eq('user_a', userId).order('user_b')),
    selectAll(() => supabase.from('friendships').select('*').eq('user_b', userId).order('user_a')),
  ]);
  return [...a, ...b];
}

export const EXPORT_FORMAT = 'attune-data-export-v2';

export async function exportMyData(userId, { now = new Date() } = {}) {
  const data = {};
  const included = [];
  const skipped = [];

  const run = async (key, label, load) => {
    try {
      data[key] = await load();
      included.push(label);
    } catch (err) {
      console.error(`Export: couldn't read ${label}:`, err);
      skipped.push({ section: label, reason: reasonFor(err) });
    }
  };

  await run('profile', 'Profile and targets', () => getProfile(userId));
  for (const def of EXPORT_TABLES) await run(def.key, def.label, () => loadTable(def, userId));
  await run('friendships', 'Friends', () => loadFriendships(userId));
  await run('coaches', 'Your coaches (names and consent)', async () => (await getMyTrainers(userId)).map((t) => ({ status: t.status, connectedAt: t.created_at, consentedAt: t.consented_at, coach: t.trainer?.name ?? null })));

  return {
    format: EXPORT_FORMAT,
    exportedAt: now.toISOString(),
    // What this file leaves out on purpose, so nobody assumes it's missing by mistake.
    notIncluded: [
      'Private notes a coach keeps about a client — only that coach can read them.',
      'The progress-photo image files themselves (they are listed above and stay in your account).',
      'Anything about other people.',
    ],
    included,
    skipped,
    ...data,
  };
}

export const exportFilename = (now = new Date()) => `attune-data-export-${now.toISOString().slice(0, 10)}.json`;
