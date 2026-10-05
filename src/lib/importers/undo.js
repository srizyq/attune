// Undoing an import. Nothing in the database says "these rows came from import
// #3", so an import is remembered by *when* it ran: the server timestamps of the
// rows it added (see makeBatch in run.js). Undo removes food marked as imported
// inside that window, and weigh-ins inside it on the dates the import wrote.
//
// What that means in practice: entries the import added are removed even if they
// were edited afterwards (an edit keeps the "imported" mark); entries copied from
// them to other days, and anything logged by hand, are not touched.
//
// The remembered batch lives in this browser's localStorage (it's tiny — two
// timestamps and a list of dates), so it survives closing the screen but not
// switching device. It expires after a month.

const KEY = (userId) => `attune-last-import:${userId}`;
export const UNDO_WINDOW_DAYS = 30;

function getStorage(storage) {
  if (storage) return storage;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function saveLastImport(userId, batch, { storage, now = new Date() } = {}) {
  const s = getStorage(storage);
  if (!s || !userId || !batch) return false;
  try {
    s.setItem(KEY(userId), JSON.stringify({ ...batch, at: now.toISOString() }));
    return true;
  } catch {
    return false; // storage full or blocked — undo is then only available until this screen closes
  }
}

function valid(b) {
  return b && typeof b === 'object'
    && typeof b.from === 'string' && typeof b.to === 'string' && !Number.isNaN(new Date(b.from).getTime()) && !Number.isNaN(new Date(b.to).getTime())
    && Array.isArray(b.weightDates) && Number.isFinite(b.foodAdded) && Number.isFinite(b.weightAdded)
    && typeof b.at === 'string' && !Number.isNaN(new Date(b.at).getTime());
}

export function loadLastImport(userId, { storage, now = new Date() } = {}) {
  const s = getStorage(storage);
  if (!s || !userId) return null;
  try {
    const raw = s.getItem(KEY(userId));
    if (!raw) return null;
    const b = JSON.parse(raw);
    if (!valid(b)) return null;
    const ageDays = (now.getTime() - new Date(b.at).getTime()) / 86400000;
    if (ageDays > UNDO_WINDOW_DAYS || ageDays < -1) return null;
    return b;
  } catch {
    return null;
  }
}

export function clearLastImport(userId, { storage } = {}) {
  const s = getStorage(storage);
  if (!s || !userId) return;
  try { s.removeItem(KEY(userId)); } catch { /* ignore */ }
}

// db: { deleteImportedFood(userId, from, to) → n, deleteImportedWeights(userId, dates, from, to) → n }
// Food first, then weights; stops at the first error and says how far it got.
export async function undoImport({ userId, batch, db }) {
  const result = { foodRemoved: 0, weightRemoved: 0, error: null };
  try {
    if (batch.foodAdded > 0) result.foodRemoved = await db.deleteImportedFood(userId, batch.from, batch.to);
    if (batch.weightAdded > 0 && batch.weightDates.length > 0) result.weightRemoved = await db.deleteImportedWeights(userId, batch.weightDates, batch.from, batch.to);
  } catch (err) {
    result.error = err?.message || 'Something went wrong while undoing.';
  }
  return result;
}
