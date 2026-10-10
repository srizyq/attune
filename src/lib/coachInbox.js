// Helpers for the dashboard bell's list of messages from the user's coach(es).
// "Seen" is remembered on this device only (no database column): the time of
// the newest message that was on screen when the bell was last opened.

const seenKey = (userId) => `attune_coach_inbox_seen_${userId}`;

export function getSeenAt(userId) {
  try { return localStorage.getItem(seenKey(userId)); } catch { return null; }
}

export function setSeenAt(userId, iso) {
  try { localStorage.setItem(seenKey(userId), iso); } catch { /* best-effort */ }
}

// Messages newer than the last time the bell was opened. With nothing stored
// yet, every message counts as new.
export function countUnread(messages, seenAt) {
  if (!seenAt) return messages.length;
  const seen = new Date(seenAt).getTime();
  return messages.filter((m) => new Date(m.created_at).getTime() > seen).length;
}

// What to call a message and where tapping it should go.
export function messageKind(m) {
  if (m.category === 'weight') return { label: 'Weight', target: 'weight' };
  if (m.category === 'nutrition' && m.comment_date) return { label: 'Food', target: 'food' };
  return { label: 'General', target: 'chat' };
}

export function relativeLabel(iso, now = Date.now()) {
  const days = Math.floor((now - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
