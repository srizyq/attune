// Stripe calls this after checkout completes and whenever a subscription
// changes state — it's the only source of truth for coach_pass and
// is_premium once billing is live (the client never sets either
// directly anymore). One customer can hold both a Coach Pass and a Pro
// subscription at once, each with its own subscription id, so every
// branch below reads `plan` from the event's own metadata (set at
// checkout — see create-checkout-session.js) to know which pair of
// columns it's updating, rather than assuming there's only one. Needs
// the RAW request body to verify Stripe's signature, so body parsing is
// disabled and read manually below.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { planOf, checkoutCompletedFields, subscriptionUpdate, subscriptionDeletion } from './_stripeState.js';

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
          // A trial signup is 'trialing', not 'active' — ask Stripe for the
          // real status rather than assuming. If that lookup fails, the
          // subscription.updated event that follows corrects it.
          let status;
          if (session.subscription) {
            try {
              status = (await stripe.subscriptions.retrieve(session.subscription)).status;
            } catch (err) {
              console.error('Could not read subscription status at checkout:', err.message);
            }
          }
          const fields = checkoutCompletedFields({
            plan: planOf(session), customerId: session.customer, subscriptionId: session.subscription, status,
          });
          const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
          if (error) throw error;
        }
        break;
      }
      // Renewals, a trial converting to paid, past-due (failed card) and
      // reactivation — the relevant pass tracks live with Stripe's status.
      case 'customer.subscription.updated': {
        const { match, fields } = subscriptionUpdate(event.data.object);
        const { error } = await supabase.from('profiles').update(fields).eq(match.column, match.value);
        if (error) throw error;
        break;
      }
      // Cancellation — also drops coach_mode so a lapsed trainer isn't left
      // sitting on /coach with no way to reach it.
      case 'customer.subscription.deleted': {
        const { match, fields } = subscriptionDeletion(event.data.object);
        const { error } = await supabase.from('profiles').update(fields).eq(match.column, match.value);
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
