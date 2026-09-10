import { supabase } from './supabase';

// POSTs to one of our own Stripe-backed endpoints (create-checkout-session,
// create-portal-session) with the current session's access token — shared
// between the Coach Pass and Pro billing buttons so both talk to Stripe
// the exact same way.
export async function authedPost(path, body) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Something went wrong — try again.');
  return data;
}
