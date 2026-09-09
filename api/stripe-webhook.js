// Stripe calls this after checkout completes and whenever a subscription
// changes state — it's the only source of truth for coach_pass once
// billing is live (the client never sets it directly anymore). Needs the
// RAW request body to verify Stripe's signature, so body parsing is
// disabled and read manually below.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method not allowed');
    return;
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];
  if (!stripeKey || !webhookSecret || !sig) {
    res.status(400).end('Webhook not configured');
    return;
  }
  const stripe = new Stripe(stripeKey);

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    res.status(400).end(`Webhook Error: ${err.message}`);
    return;
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Each branch throws on a failed write so the catch below returns a
    // non-2xx — Stripe automatically retries a failed webhook delivery,
    // but only if we actually tell it something went wrong. Returning 200
    // unconditionally would silently drop a failed database write with no
    // record of it and no retry.
    switch (event.type) {
      // Checkout finished — grant the pass and remember the Stripe IDs so
      // later subscription-lifecycle events (below) can find this user.
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        if (userId) {
          const { error } = await supabase.from('profiles').update({
            coach_pass: true,
            coach_pass_status: 'active',
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
          }).eq('id', userId);
          if (error) throw error;
        }
        break;
      }
      // Covers renewals, past-due (failed card), and reactivation —
      // coach_pass tracks live with Stripe's own subscription status.
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const { error } = await supabase.from('profiles').update({
          coach_pass_status: sub.status,
          coach_pass: sub.status === 'active',
        }).eq('stripe_subscription_id', sub.id);
        if (error) throw error;
        break;
      }
      // Cancellation — also drop coach_mode so a lapsed trainer isn't left
      // sitting on /coach with no way to reach it (Coach.jsx's own guard
      // would redirect them, but this keeps the profile state consistent
      // even before they next open the app).
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const { error } = await supabase.from('profiles').update({
          coach_pass: false,
          coach_mode: false,
          coach_pass_status: 'canceled',
        }).eq('stripe_subscription_id', sub.id);
        if (error) throw error;
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    res.status(500).end('Webhook handler failed');
    return;
  }

  res.status(200).json({ received: true });
}
