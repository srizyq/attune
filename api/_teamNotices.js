// Emails to clients telling them the owner of their coach's team can view the
// data they share with that coach. Rows are queued by the database (see
// team_view_notices in supabase/schema.sql); this sends them from the existing
// scheduled endpoint (api/send-reminders.js). A notice is marked sent only
// after the email went out, so a failed send is retried on the next run.

const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

export function teamNoticeEmail({ clientName, coachName, ownerName, appUrl = '' }) {
  const coach = coachName || 'your coach';
  const owner = ownerName || 'the owner of their team';
  const lines = [
    `Hi ${first(clientName)},`,
    '',
    `${coach} coaches you on Attune and is part of a team. ${owner}, who owns that team, can see the information you share with ${coach}: your food log, weight, check-ins, workouts, measurements and progress photos.`,
    '',
    `They can only view it, and they cannot see your messages with ${coach} or ${coach}'s private notes.`,
    '',
    `You can end this at any time by disconnecting from ${coach} in the Coach tab of Attune.`,
  ];
  if (appUrl) lines.push('', `Open Attune: ${appUrl}`);
  return { subject: `The owner of ${coach}'s team can now view your Attune data`, text: lines.join('\n') };
}

/**
 * Sends up to `limit` queued notices. `store` reads and marks the queue,
 * `sendEmail` is the Resend sender (null when no key is set — nothing is
 * marked then, so they go out once there is one).
 */
export async function processTeamNotices({ store, sendEmail, appUrl = '', limit = 25, now = Date.now() }) {
  const pending = await store.pending(limit);
  if (!pending.length || !sendEmail) return { checked: pending.length, sent: 0 };
  let sent = 0;
  for (const n of pending) {
    const email = await store.emailOf(n.client_id);
    // Someone with no email address on file still sees the notice in the app.
    if (!email) { await store.markEmailed(n.client_id, n.owner_id, now); continue; }
    const names = await store.names([n.client_id, n.owner_id, n.trainer_id]);
    const ok = await sendEmail({ to: email, ...teamNoticeEmail({ clientName: names[n.client_id], coachName: names[n.trainer_id], ownerName: names[n.owner_id], appUrl }) });
    if (!ok) continue;
    await store.markEmailed(n.client_id, n.owner_id, now);
    sent += 1;
  }
  return { checked: pending.length, sent };
}

export function supabaseNoticeStore(supabase) {
  return {
    pending: async (limit) => (await supabase.from('team_view_notices').select('client_id, owner_id, trainer_id').is('emailed_at', null).order('created_at').limit(limit)).data || [],
    emailOf: async (id) => (await supabase.auth.admin.getUserById(id)).data?.user?.email || null,
    names: async (ids) => {
      const { data } = await supabase.from('profiles').select('id, name').in('id', ids);
      return Object.fromEntries((data || []).map((p) => [p.id, p.name]));
    },
    markEmailed: async (clientId, ownerId, now) => {
      await supabase.from('team_view_notices').update({ emailed_at: new Date(now).toISOString() }).eq('client_id', clientId).eq('owner_id', ownerId);
    },
  };
}
