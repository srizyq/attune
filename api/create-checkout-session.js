// Creates a Stripe Checkout Session for either paid subscription — Coach
// Pass or Pro. The client never talks to Stripe directly for this — the
// secret key and price IDs stay server-only, same reasoning as
// recognize-food.js keeping the Anthropic key off the browser.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const PLANS = {
  coach: { priceEnv: 'STRIPE_COACH_PRICE_ID', successParam: 'coach_pass' },
  pro:   { priceEnv: 'STRIPE_PRO_PRICE_ID',   successParam: 'pro' },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const plan = PLANS[req.body?.plan] ? req.body.plan : 'coach';
  const { priceEnv, successParam } = PLANS[plan];

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env[priceEnv];
  if (!supabaseUrl || !serviceKey || !stripeKey || !priceId) {
    res.status(500).json({ error: 'Billing is not fully configured' });
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(stripeKey);

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    res.status(401).json({ error: 'Sign in required.' });
    return;
  }
  const userId = userData.user.id;

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();

  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // Reuse the existing Stripe customer on a resubscribe (or when
      // subscribing to the other plan) rather than creating a duplicate
      // one for the same person.
      customer: profile?.stripe_customer_id || undefined,
      customer_email: profile?.stripe_customer_id ? undefined : (userData.user.email || undefined),
      client_reference_id: userId,
      metadata: { supabase_user_id: userId, plan },
      subscription_data: { metadata: { supabase_user_id: userId, plan } },
      success_url: `${origin}/settings?${successParam}=success`,
      cancel_url: `${origin}/settings?${successParam}=cancelled`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout session error:', err);
    res.status(500).json({ error: "Couldn't start checkout — try again." });
  }
}
