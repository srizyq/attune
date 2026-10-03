// Permanently deletes a user and everything of theirs. Underscore-prefixed so
// Vercel doesn't deploy it as its own endpoint (the project is at the 12-
// function Hobby cap) — it's reached through create-portal-session.js.
//
// Order matters: billing is stopped FIRST, so a failure there aborts the
// whole thing and nobody is left with a deleted account that is still being
// charged. Stored files go next (deleting the auth user does not remove
// storage objects), then the auth user itself — every table references it
// with `on delete cascade`, so the rows follow.

const BUCKETS = ['progress-photos', 'coach-logos'];
const DEAD_STATUSES = new Set(['canceled', 'incomplete_expired']);

async function cancelSubscriptions(stripe, customerId) {
  const subs = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
  for (const sub of subs.data) {
    if (!DEAD_STATUSES.has(sub.status)) await stripe.subscriptions.cancel(sub.id);
  }
}

async function removeUserFiles(supabase, userId) {
  for (const bucket of BUCKETS) {
    // Re-list until empty rather than paging, since each pass removes what it listed.
    for (let pass = 0; pass < 50; pass++) {
      const { data, error } = await supabase.storage.from(bucket).list(userId, { limit: 100 });
      if (error) throw error;
      const files = (data || []).filter((f) => f.name);
      if (files.length === 0) break;
      const { error: removeError } = await supabase.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) throw removeError;
    }
  }
}

export async function deleteAccount({ supabase, stripe, userId }) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) await cancelSubscriptions(stripe, profile.stripe_customer_id);
  await removeUserFiles(supabase, userId);

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}
