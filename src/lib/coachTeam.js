// Pure helpers for the team screens (see supabase/schema.sql, "Coach teams").

export const MAX_TEAM_NAME = 60; // mirrors coach_teams.name's check

// "No clients yet" / "1 client" / "12 clients".
export function clientCountLabel(n) {
  const count = Number(n) || 0;
  if (count === 0) return 'No clients yet';
  return `${count} client${count === 1 ? '' : 's'}`;
}

// "Expires today" / "Expires tomorrow" / "Expires in 5 days" / "Expired".
export function inviteExpiry(expiresAt, now = new Date()) {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 'Expired';
  const days = Math.ceil(ms / 86400000);
  if (days <= 1) return ms < 86400000 / 2 ? 'Expires today' : 'Expires tomorrow';
  return `Expires in ${days} days`;
}

// Teammates a coach could bring in on a client: on the team, holding a Coach
// Pass, not the coach themself and not already coaching (or invited to coach)
// that client. `coaches` are the client's existing co-coaches.
export function shareableTeammates(team, selfId, coaches) {
  if (!team) return [];
  const taken = new Set((coaches || []).map((c) => c.id));
  return (team.members || []).filter((m) => m.user_id !== selfId && m.has_pass && !taken.has(m.user_id));
}

// Trimmed, length-limited name, or the reason it isn't usable.
export function validateTeamName(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return { name: null, error: 'Give the team a name.' };
  if (name.length > MAX_TEAM_NAME) return { name: null, error: `Keep the team name to ${MAX_TEAM_NAME} characters or fewer.` };
  return { name, error: null };
}
