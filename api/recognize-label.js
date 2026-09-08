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

const client = new Anthropic();

const FREE_MONTHLY_SCAN_LIMIT = 5;

const PROMPT = `You're looking at a photo of a nutrition facts label from a packaged food or drink. Read the label carefully and extract its nutrition information.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"serving": string, "servingGrams": number or null, "cal": number, "protein": number, "carbs": number, "fat": number, "fibre": number, "sodium": number, "sugar": number}

Field notes:
- serving: the label's own serving size description, for example 1 cup (240ml) or 2 biscuits (30g)
- servingGrams: the serving size in grams if the label states or implies a gram weight, otherwise null
- cal: calories per serving
- protein, carbs, fat, fibre, sugar: grams per serving
- sodium: milligrams per serving
- If a value isn't shown on the label, use 0 for macros/sodium/fibre/sugar — never omit a field. Use null only for servingGrams when no gram weight is stated or impliable.

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
    .select('is_premium, photo_scans_used, photo_scans_period_start')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    res.status(500).json({ error: "Couldn't verify your account. Try again." });
    return;
  }

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

    if (!profile.is_premium) {
      await supabase.from('profiles')
        .update({ photo_scans_used: usedSoFar + 1, photo_scans_period_start: today })
        .eq('id', userId);
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: "Couldn't read a response for this label." });
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
      console.error('Failed to parse label recognition response:', textBlock.text);
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
