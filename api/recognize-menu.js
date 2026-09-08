// Serverless proxy for menu-photo recommendations. Same shape as
// api/recognize-food.js (auth required, server-side monthly cap via the
// service-role client, key never reaches the browser) but this one also
// reads the user's goal and today's food_logs itself — "today's remaining
// calories/macros" is the whole point of the recommendation, and computing
// it server-side from data we already have direct access to is more
// trustworthy than taking the client's word for it, at no extra cost.

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const client = new Anthropic();

const FREE_MONTHLY_SCAN_LIMIT = 3;

const GOAL_COPY = {
  lose: 'losing weight (in a calorie deficit)',
  maintain: 'maintaining their current weight',
  build: 'building muscle (in a calorie surplus, prioritising protein)',
};

function buildPrompt(goal, remaining) {
  const goalLine = GOAL_COPY[goal] || 'eating a balanced diet';
  return `You're looking at a photo of a restaurant/fast-food menu. The person ordering is ${goalLine}. Based on what's left in their day, they have roughly:
- ${remaining.calories} kcal
- ${remaining.protein}g protein
- ${remaining.carbs}g carbs
- ${remaining.fat}g fat
remaining today.

Read the menu and recommend the 3 best options for them. You're not limited to picking 3 whole standalone items — you can combine items across menu sections (e.g. a main plus a side from elsewhere on the menu) and suggest simple modifications (e.g. dressing on the side, swap fries for a side salad, no bun), as long as it's something they could realistically order at this restaurant. If you suggest a modification, recalculate the macros for the modified version — don't report the stock item's macros for a modified order.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"recommendations": [{"name": string, "items": string, "modifications": string or null, "cal": number, "protein": number, "carbs": number, "fat": number, "confidence": "low" | "medium" | "high"}, ...]}

Field notes:
- name: a short label for this pick, for example Grilled chicken bowl, dressing on the side
- items: what it's built from off the menu, for example Grilled chicken bowl plus a side of steamed veggies instead of rice
- modifications: what changed from the stock menu item, as plain text. Use the JSON value null if it was ordered exactly as listed with nothing changed — do not use the word none as a string.
- cal, protein, carbs, fat: numbers only
- confidence: one of low, medium, or high

Always return exactly 3 recommendations, ranked best first for this person's goal and remaining macros.

If the photo doesn't clearly show a menu, reply with exactly: {"error": "No menu detected in this photo."}

Macros are grams, calories are kcal, all rounded to whole numbers except macros can have one decimal.`;
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
    res.status(500).json({ error: 'Menu recognition is not fully configured' });
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
    .select('is_premium, goal, calorie_target, protein_g, carbs_g, fat_g, menu_scans_used, menu_scans_period_start')
    .eq('id', userId)
    .single();
  if (profileError || !profile) {
    res.status(500).json({ error: "Couldn't verify your account. Try again." });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const inSamePeriod = samePeriod(profile.menu_scans_period_start, today);
  const usedSoFar = inSamePeriod ? profile.menu_scans_used : 0;

  if (!profile.is_premium && usedSoFar >= FREE_MONTHLY_SCAN_LIMIT) {
    res.status(403).json({
      error: `You've used all ${FREE_MONTHLY_SCAN_LIMIT} free menu scans this month — upgrade to Pro for unlimited scans.`,
      limitReached: true,
    });
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

  // "Remaining today" — sum what's already logged today and subtract from
  // target. Clamped at 0 rather than going negative; a person who's already
  // over target still gets sane recommendations instead of a nonsense
  // negative-budget prompt.
  const { data: todayLogs } = await supabase
    .from('food_logs')
    .select('calories, protein_g, carbs_g, fat_g')
    .eq('user_id', userId)
    .eq('logged_date', today);
  const consumed = (todayLogs || []).reduce(
    (acc, row) => ({
      calories: acc.calories + (Number(row.calories) || 0),
      protein: acc.protein + (Number(row.protein_g) || 0),
      carbs: acc.carbs + (Number(row.carbs_g) || 0),
      fat: acc.fat + (Number(row.fat_g) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const remaining = {
    calories: Math.max(0, Math.round((profile.calorie_target || 2000) - consumed.calories)),
    protein: Math.max(0, Math.round((profile.protein_g || 0) - consumed.protein)),
    carbs: Math.max(0, Math.round((profile.carbs_g || 0) - consumed.carbs)),
    fat: Math.max(0, Math.round((profile.fat_g || 0) - consumed.fat)),
  };

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: buildPrompt(profile.goal, remaining) },
          ],
        },
      ],
    });

    if (!profile.is_premium) {
      await supabase.from('profiles')
        .update({ menu_scans_used: usedSoFar + 1, menu_scans_period_start: today })
        .eq('id', userId);
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) {
      res.status(502).json({ error: "Couldn't read a response for this menu." });
      return;
    }

    let parsed;
    try {
      let cleaned = textBlock.text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      // Defensive second layer: if the model still wraps the JSON in stray
      // prose despite being asked not to, take the substring between the
      // first { and the last } rather than failing outright on it.
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start > 0 && end > start) cleaned = cleaned.slice(start, end + 1);
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse menu recognition response:', textBlock.text);
      res.status(502).json({ error: "Couldn't understand the response for this menu. Try again." });
      return;
    }

    if (parsed.error) {
      res.status(200).json({ error: parsed.error });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    console.error('Menu recognition error:', err);
    res.status(502).json({ error: 'Menu recognition is temporarily unavailable.' });
  }
}
