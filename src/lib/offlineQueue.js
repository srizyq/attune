// Food entries logged while offline. They're kept in localStorage and replayed
// (in order) when the connection returns, or when the user taps "Sync now".
const KEY = 'attune.offlineQueue.v1';

function read() {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full/blocked */ }
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// True for failures that mean "couldn't reach the server" (not a rejected row).
export function isNetworkError(err) {
  if (isOffline()) return true;
  const msg = String(err?.message || err || '');
  return err instanceof TypeError || /failed to fetch|network|load failed|offline/i.test(msg);
}

export function enqueueFood(userId, entry) {
  write([...read(), { userId, entry, queuedAt: Date.now() }]);
}
export function pendingCount() { return read().length; }

let syncing = false;
// save(userId, entry) is injected so this file stays free of the DB layer.
export async function syncQueue(save, userId) {
  if (syncing || isOffline()) return { synced: 0, remaining: pendingCount() };
  syncing = true;
  let synced = 0;
  try {
    const items = read();
    const left = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.userId !== userId) { left.push(item); continue; }
      try {
        await save(item.userId, item.entry);
        synced++;
      } catch (err) {
        if (isNetworkError(err)) { left.push(item, ...items.slice(i + 1)); break; }
        // A row the server rejects would block the queue forever: drop it.
        console.error('Dropping an unsyncable offline entry:', err);
      }
    }
    write(left);
    return { synced, remaining: left.length };
  } finally { syncing = false; }
}
