// Serverless proxy for nutrition-label OCR — used by the "add this
// product" flow when a barcode isn't found in FatSecret, Open Food
// Facts, or the shared barcode_products table (see BarcodeScanner in
// src/pages/FoodSearch.jsx). Same shape as api/recognize-food.js: auth
// required, key never reaches the browser, monthly free-scan cap
// enforced server-side. Deliberately shares that same cap (not a
// separate counter) — it's the same kind of vision API call and the
// same cost to control.
//
// Only extracts nutrition FACTS from the label photo, not the product's
// name/brand — those come from what the user typed, since a nutrition
// panel alone rarely carries a clean marketing name and guessing one
// from it is more likely to produce a bad shared-database entry than
// just asking the person adding it.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { withCompGrants } from '../src/lib/compGrants.js';
import { withTrial } from '../src/lib/trial.js';

const client = new Anthropic();

const FREE_MONTHLY_SCAN_LIMIT = 5;

const PROMPT = `You're looking at a photo of a nutrition facts label from a packaged food or drink. Read the label carefully and extract its nutrition information.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"serving": string, "servingGrams": number or null, "servingUnit": "g" | "ml", "cal": number, "protein": number, "carbs": number, "fat": number, "fibre": number, "sodium": number, "sugar": number}

Field notes:
- serving: the label's own serving size description, for example 1 cup (240ml) or 2 biscuits (30g)
- servingGrams: the serving size as a plain number, in whichever unit servingUnit reports — null if the label states no weight/volume at all (e.g. "1 biscuit" with no gram or ml figure)
- servingUnit: "ml" if the label states or implies the serving as a volume (ml, L, cup, fl oz — this is a drink), otherwise "g"
- cal: calories per serving
- protein, carbs, fat, fibre, sugar: grams per serving
- sodium: milligrams per serving
- If a value isn't shown on the label, use 0 for macros/sodium/fibre/sugar — never omit a field. Use null only for servingGrams when no weight or volume is stated or impliable.

If the photo doesn't clearly show a nutrition facts label, reply with exactly: {"error": "No nutrition label detected in this photo."}

Use the label's own printed values — this is a transcription task, not an estimate.`;

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
    res.status(500).json({ error: 'Label recognition is not fully configured' });
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

  const { image, mediaType } = req.body || {};
  if (!image) {
    res.status(400).json({ error: 'Missing image' });
    return;
  }
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) {
    res.status(400).json({ error: 'Unsupported image type' });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const inSamePeriod = samePeriod(profile.photo_scans_period_start, today);
  const usedSoFar = inSamePeriod ? profile.photo_scans_used : 0;

  if (!profile.is_premium && usedSoFar >= FREE_MONTHLY_SCAN_LIMIT) {
    res.status(403).json({
      error: `You've used all ${FREE_MONTHLY_SCAN_LIMIT} free photo scans this month — upgrade to Pro for unlimited scans.`,
      limitReached: true,
    });
    return;
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      // Adaptive thinking is on by default and its budget comes out of
      // max_tokens — on a harder-to-read photo, thinking alone can consume
      // the whole budget and leave zero tokens for the actual answer
      // (content = [thinking], no text block). Confirmed against the real
      // API on recognize-menu.js's identical pattern. This is a
      // single-shot structured-JSON extraction with no need for exposed
      // reasoning, so disabling thinking removes the failure mode entirely.
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    });

    // Counts against the cap the moment we've actually spent the money on
    // an Anthropic call, regardless of what it returned (a real result, a
    // "no label detected", or an unparseable reply below) — not counted if
    // we rejected the request before ever calling Anthropic (missing
    // image, wrong type, or already over the limit above). Same reasoning
    // as recognize-food.js/recognize-menu.js: not charging for a failed
    // parse would let a crafted "always fails" request bypass the cap for
    // free indefinitely, since the real cost (the API call) already
    // happened either way.
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
      console.error('Label recognition returned no text block:', diagnostics);
      res.status(502).json({ error: "Couldn't read a response for this label. Try again." });
      return;
    }

    let parsed;
    try {
      let cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1);
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse label recognition response:', { ...diagnostics, text: textBlock.text });
      res.status(502).json({ error: "Couldn't understand the response for this label. Try again." });
      return;
    }

    if (parsed.error) {
      res.status(200).json({ error: parsed.error });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Label recognition error:', err);
    res.status(502).json({ error: 'Label recognition is temporarily unavailable.' });
  }
}
