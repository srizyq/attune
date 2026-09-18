// Serverless proxy for text-described food estimation — the "can't find
// it? estimate with AI" fallback in FoodSearch, for dishes that aren't in
// FatSecret, Open Food Facts, or the AFCD reference table (typically
// regional/takeaway dishes like a halal snack pack that no packaged-goods
// or standardized-food database will ever carry). Same shape as
// recognize-food.js: auth required, key never reaches the browser, and it
// deliberately shares that same monthly free-scan cap rather than a
// separate counter — it's the same kind of paid AI call and the same
// cost to control, just text instead of vision.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { withCompGrants } from '../src/lib/compGrants.js';
import { withTrial } from '../src/lib/trial.js';

const client = new Anthropic();

const FREE_MONTHLY_SCAN_LIMIT = 5;

function buildPrompt(description) {
  return `You're estimating nutrition for a food someone typed into a food-logging app's search box, because it wasn't found in any of the connected food databases. This is often a specific dish, restaurant item, or regional/local food (for example, an Australian takeaway dish).

Food described: "${description}"

Estimate its nutrition for ONE typical single serving/portion of this food, as it's normally served.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"name": "short standardised food name", "portion": "estimated typical portion, e.g. '1 serve (~450g)'", "servingGrams": number, "cal": number, "protein": number, "carbs": number, "fat": number, "fibre": number, "sodium": number, "sugar": number, "confidence": "low" | "medium" | "high"}

Field notes:
- servingGrams is your best estimate of that portion's weight in grams (used so the app can scale the values if someone logs a different amount).
- protein/carbs/fat/fibre/sugar are grams, sodium is milligrams, cal is kcal.
- Round to whole numbers, except macros/sugar can have one decimal.
- confidence is "low" for a niche, ambiguous, or highly recipe-variable dish, "high" for a well-known item with a fairly consistent standard recipe.

If the description is too vague, nonsensical, or doesn't describe a food at all, reply with exactly: {"error": "Couldn't identify a food from that description."}`;
}

function samePeriod(periodStart, today) {
  return !!periodStart && periodStart.slice(0, 7) === today.slice(0, 7);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'AI estimation is not fully configured' });
    return;
  }
  const supabase = createClient(supabaseUrl, serviceKey);

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

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('is_premium, trial_ends_at, photo_scans_used, photo_scans_period_start')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    res.status(500).json({ error: "Couldn't verify your account. Try again." });
    return;
  }
  // Both a comp'd account (compGrants.js) and an active free trial
  // (trial.js) otherwise only granted Pro in the client's own UI — this
  // endpoint read the real, un-comped/un-trialed is_premium straight from
  // the DB and still enforced the free-scan cap on them.
  Object.assign(profile, withTrial(profile));
  Object.assign(profile, withCompGrants(profile, userData.user.email));

  const { description } = req.body || {};
  if (!description || typeof description !== 'string' || !description.trim()) {
    res.status(400).json({ error: 'Missing description' });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const inSamePeriod = samePeriod(profile.photo_scans_period_start, today);
  const usedSoFar = inSamePeriod ? profile.photo_scans_used : 0;

  if (!profile.is_premium && usedSoFar >= FREE_MONTHLY_SCAN_LIMIT) {
    res.status(403).json({
      error: `You've used all ${FREE_MONTHLY_SCAN_LIMIT} free AI estimates this month — upgrade to Pro for unlimited.`,
      limitReached: true,
    });
    return;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      // Adaptive thinking is on by default and its budget comes out of
      // max_tokens — on an ambiguous description, thinking alone can
      // consume the whole budget and leave zero tokens for the actual
      // answer (content = [thinking], no text block). Confirmed against
      // the real API on recognize-menu.js's identical pattern. This is a
      // single-shot structured-JSON extraction with no need for exposed
      // reasoning, so disabling thinking removes the failure mode entirely.
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: buildPrompt(description.trim().slice(0, 200)) }],
    });

    // Counts against the cap the moment we've actually spent the money on
    // an Anthropic call, regardless of what it returned (a real estimate,
    // a "couldn't identify a food", or an unparseable reply below) — not
    // counted if we rejected the request before ever calling Anthropic
    // (missing/empty description, or already over the limit above). Same
    // reasoning as recognize-food.js/recognize-menu.js: not charging for a
    // failed parse would let a crafted "always fails" request bypass the
    // cap for free indefinitely, since the real cost (the API call)
    // already happened either way.
    if (!profile.is_premium) {
      await supabase.from('profiles')
        .update({ photo_scans_used: usedSoFar + 1, photo_scans_period_start: today })
        .eq('id', userId);
    }

    // Logged on every failure path below — stop_reason and usage are what
    // it takes to diagnose a failure immediately from Vercel's function
    // logs instead of needing a one-off reproduction script against the
    // live API (see recognize-menu.js, which hit exactly this and had to
    // be debugged that way).
    const diagnostics = { stop_reason: response.stop_reason, usage: response.usage };

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      console.error('Food estimation returned no text block:', diagnostics);
      res.status(502).json({ error: "Couldn't read a response for that description. Try again." });
      return;
    }

    let parsed;
    try {
      const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse food estimation response:', { ...diagnostics, text: textBlock.text });
      res.status(502).json({ error: "Couldn't understand the response. Try again." });
      return;
    }

    if (parsed.error) {
      res.status(200).json({ error: parsed.error });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Food estimation error:', err);
    res.status(502).json({ error: 'AI estimation is temporarily unavailable.' });
  }
}
