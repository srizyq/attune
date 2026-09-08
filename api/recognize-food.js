// Serverless proxy for photo food recognition. The Anthropic API key must
// never reach the browser — this is exactly why the old menu/plate-photo
// scanning feature was removed earlier (it called api.anthropic.com
// directly from client code with no auth, which would have meant shipping
// a secret key to every browser). This function holds the key server-side
// and the client only ever talks to our own origin.
//
// Every call here costs real money (an Anthropic API request), so unlike
// the other /api endpoints this one requires the caller to be a signed-in
// user and enforces a monthly scan cap for anyone who isn't Pro. The cap
// is tracked server-side via the service-role client — a free user's own
// auth token can read/update their own profile row per RLS, so the count
// has to be written by code they don't control, or they could just reset
// it themselves with a direct Supabase call.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic();

const FREE_MONTHLY_SCAN_LIMIT = 5;

const PROMPT = `You're looking at a photo of food. Identify what's in it and estimate its nutrition.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"name": "short food name", "portion": "estimated portion, e.g. '1 medium bowl (~350g)'", "cal": number, "protein": number, "carbs": number, "fat": number, "confidence": "low" | "medium" | "high"}

If the photo doesn't clearly show food, reply with exactly: {"error": "No food detected in this photo."}

Macros are grams, calories are kcal, all rounded to whole numbers except macros can have one decimal. This is a best-effort visual estimate, not a lab measurement — use your best judgement on typical portion sizes and preparation (e.g. oil/butter used in cooking, dressing on a salad).`;

// Correction mode — the user is looking at the same photo and telling us
// what's actually wrong with a first-pass estimate (wrong food, wrong
// portion, etc.), so the prompt carries that estimate plus their comment
// as context instead of asking Claude to start blind. Free-form —
// correcting the food identity and correcting the portion size both flow
// through the same field, since the model can tell which the user means.
function correctionPrompt(previousResult, comment) {
  return `You're looking at a photo of food. A first-pass estimate was made, and the user has reviewed it and left a correction.

Previous estimate: ${JSON.stringify(previousResult)}
User's correction: "${comment}"

Re-identify the food and re-estimate its nutrition, taking the user's correction as ground truth (e.g. if they say it's actually a different food, or a different portion size, trust that over the photo's first impression).

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"name": "short food name", "portion": "estimated portion, e.g. '1 medium bowl (~350g)'", "cal": number, "protein": number, "carbs": number, "fat": number, "confidence": "low" | "medium" | "high"}

If the correction makes it clear this isn't food at all, reply with exactly: {"error": "No food detected in this photo."}

Macros are grams, calories are kcal, all rounded to whole numbers except macros can have one decimal.`;
}

// "Same billing period" is just "same calendar month" — simplest thing
// that resets on its own with no cron job, at the cost of everyone's
// free scans resetting on the 1st rather than on their own signup
// anniversary. Good enough for a 5-scan/month free cap.
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
    res.status(500).json({ error: 'Photo recognition is not fully configured' });
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
    .select('is_premium, photo_scans_used, photo_scans_period_start')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    res.status(500).json({ error: "Couldn't verify your account. Try again." });
    return;
  }

  const { image, mediaType, correction, previousResult } = req.body || {};

  // A correction re-analyzes a scan the user already paid a cap-count
  // for, so it doesn't cost another one — the cap check/increment below
  // is skipped entirely for correction calls, not just the increment.
  const isCorrection = typeof correction === 'string' && correction.trim().length > 0;

  const today = new Date().toISOString().slice(0, 10);
  const inSamePeriod = samePeriod(profile.photo_scans_period_start, today);
  const usedSoFar = inSamePeriod ? profile.photo_scans_used : 0;

  if (!isCorrection && !profile.is_premium && usedSoFar >= FREE_MONTHLY_SCAN_LIMIT) {
    res.status(403).json({
      error: `You've used all ${FREE_MONTHLY_SCAN_LIMIT} free photo scans this month — upgrade to Pro for unlimited scans.`,
      limitReached: true,
    });
    return;
  }

  if (!image) {
    res.status(400).json({ error: 'Missing image' });
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
    res.status(400).json({ error: 'Unsupported image type' });
    return;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: isCorrection ? correctionPrompt(previousResult, correction) : PROMPT },
          ],
        },
      ],
    });

    // Counts against the cap the moment we've actually spent the money on
    // an Anthropic call, regardless of what it returned (a real result, a
    // "no food detected", or an unparseable reply below) — not counted if
    // we rejected the request before ever calling Anthropic (missing
    // image, wrong type, or already over the limit above), or if this is
    // a free correction re-analysis of a scan that already counted.
    if (!isCorrection && !profile.is_premium) {
      await supabase.from('profiles')
        .update({ photo_scans_used: usedSoFar + 1, photo_scans_period_start: today })
        .eq('id', userId);
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: "Couldn't read a response for this photo." });
      return;
    }

    let parsed;
    try {
      // Claude was asked for bare JSON, but strip a code fence defensively
      // in case one slips through anyway.
      const cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse food recognition response:', textBlock.text);
      res.status(502).json({ error: "Couldn't understand the response for this photo. Try again." });
      return;
    }

    if (parsed.error) {
      res.status(200).json({ error: parsed.error });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Food recognition error:', err);
    res.status(502).json({ error: 'Food recognition is temporarily unavailable.' });
  }
}
