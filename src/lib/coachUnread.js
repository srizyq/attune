// Which clients have written to their coach since the coach last looked.
//
// "Seen" is remembered on this device only (no database column), like the
// client's own bell (lib/coachInbox.js). A client message counts as unread when
// it's newer than the later of: the last time the coach opened that client's
// messages, and the coach's own latest reply to them (replying means they've
// read it). When this has never been used on a device, only the last few days
// count — otherwise a coach's whole history would arrive as "unread".

export const FIRST_RUN_DAYS = 3;
const seenKey = (trainerId) => `attune_coach_clients_seen_${trainerId}`;
const ts = (iso) => new Date(iso).getTime();

// { base: iso, clients: { [clientId]: iso } } or null when never stored here.
export function loadSeen(trainerId) {
  try {
    const raw = JSON.parse(localStorage.getItem(seenKey(trainerId)) || 'null');
    return raw && typeof raw === 'object' && raw.base ? { base: raw.base, clients: raw.clients || {} } : null;
  } catch { return null; }
}

export function saveSeen(trainerId, seen) {
  try { localStorage.setItem(seenKey(trainerId), JSON.stringify(seen)); } catch { /* best-effort */ }
}

export const firstRunSeen = (now = Date.now()) => ({ base: new Date(now - FIRST_RUN_DAYS * 86400000).toISOString(), clients: {} });

export const markClientSeen = (seen, clientId, now = Date.now()) => ({ ...seen, clients: { ...seen.clients, [clientId]: new Date(now).toISOString() } });

// messages: [{ client_id, sender_role, body, created_at }] for one coach, both directions.
// Returns Map(clientId -> { unread, latestAt, latestBody }) for clients with at least one unread message.
export function unreadByClient(messages, seen) {
  const base = seen?.base ? ts(seen.base) : -Infinity;
  const lastCoachReply = new Map();
  for (const m of messages) {
    if (m.sender_role !== 'client') lastCoachReply.set(m.client_id, Math.max(lastCoachReply.get(m.client_id) ?? -Infinity, ts(m.created_at)));
  }
  const out = new Map();
  for (const m of messages) {
    if (m.sender_role !== 'client') continue;
    const readAt = Math.max(base, seen?.clients?.[m.client_id] ? ts(seen.clients[m.client_id]) : -Infinity, lastCoachReply.get(m.client_id) ?? -Infinity);
    if (ts(m.created_at) <= readAt) continue;
    const cur = out.get(m.client_id) || { unread: 0, latestAt: null, latestBody: '' };
    cur.unread += 1;
    if (!cur.latestAt || ts(m.created_at) > ts(cur.latestAt)) { cur.latestAt = m.created_at; cur.latestBody = m.body; }
    out.set(m.client_id, cur);
  }
  return out;
}

export const totalUnread = (map) => [...map.values()].reduce((n, v) => n + v.unread, 0);
