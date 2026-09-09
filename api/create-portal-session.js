// Opens the Stripe Billing Portal so a trainer can update payment details
// or cancel — Stripe hosts this entirely; we never see card data.
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey || !stripeKey) {
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    res.status(400).json({ error: 'No billing account found yet — subscribe first.' });
    return;
  }

  const origin = req.headers.origin || `https://${req.headers.host}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/settings`,
    });
    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal session error:', err);
    res.status(500).json({ error: "Couldn't open billing portal — try again." });
  }
}
