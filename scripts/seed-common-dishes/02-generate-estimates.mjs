// Gate 2 of the common-dishes seeding pipeline. Reads dish-list.json
// (reviewed/approved in Gate 1), submits one nutrition-estimate request per
// dish via Anthropic's Message Batches API (50% off standard pricing — the
// right fit for this kind of large, non-latency-sensitive fan-out), polls
// until the batch finishes, and writes the raw results out to local review
// files. This step NEVER touches the database — 03-commit-to-db.mjs does
// that, and only after a human has skimmed dish-estimates-review.csv for
// anything flagged.
//
// Run standalone (not through /api/estimate-food, which requires a signed-in
// user and would burn their free-tier monthly scan count):
//   ANTHROPIC_API_KEY=... node scripts/seed-common-dishes/02-generate-estimates.mjs
//
// NOT incremental — this regenerates an estimate for every dish in
// dish-list.json every time it's run, at full cost (~$1-1.25 for the
// current ~1,200). Adding more dishes later ("we'll add more later"):
// either accept regenerating the full list again, or add the names to a
// separate new-dishes-only list and run this against just that file
// instead of dish-list.json, then append the results into the existing
// review file before Gate 3 rather than overwriting it.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local ourselves (no `source`/`export` through a shell — a
// quoting slip there prints the raw secret to stdout/stderr the moment the
// shell chokes on a line, which is exactly what happened while wiring this
// script up). Only fills in keys not already set in the environment.
function loadDotEnvLocal() {
  const envPath = join(__dirname, '..', '..', '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnvLocal();

const client = new Anthropic();

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 600;
const POLL_INTERVAL_MS = 20_000;

function buildPrompt(name) {
  return `You're building a reference nutrition database entry for a food-logging app. The dish below is a KNOWN, standardized dish name from a curated list — it is not ambiguous user input, so answer for the dish as it's typically prepared and served in Australia (an Australian-Chinese restaurant's "sweet and sour pork" rather than a specific regional Chinese variant, for example), not a rare regional variant.

Dish: "${name}"

Estimate its nutrition for ONE typical single serving/portion of this dish, as it's normally served.

Reply with ONLY a JSON object (no other text, no markdown code fence) in exactly this shape:
{"name": "short standardised food name", "portion": "estimated typical portion, e.g. '1 serve (~450g)'", "servingGrams": number, "cal": number, "protein": number, "carbs": number, "fat": number, "fibre": number, "sodium": number, "sugar": number, "confidence": "low" | "medium" | "high"}

Field notes:
- servingGrams is your best estimate of that portion's weight in grams (used so the app can scale the values if someone logs a different amount).
- protein/carbs/fat/fibre/sugar are grams, sodium is milligrams, cal is kcal.
- Round to whole numbers, except macros/sugar can have one decimal.
- confidence is "low" for a dish with highly variable recipes/portions, "high" for a well-known item with a fairly consistent standard recipe.

If for some reason this isn't a real food, reply with exactly: {"error": "Couldn't identify a food from that description."}`;
}

function stripFence(text) {
  return text.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function main() {
  const listPath = join(__dirname, 'dish-list.json');
  const dishes = JSON.parse(readFileSync(listPath, 'utf-8'));
  console.log(`Loaded ${dishes.length} dishes from dish-list.json`);

  const requests = dishes.map((dish, i) => ({
    custom_id: `dish-${i}`,
    params: {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: 'disabled' },
      messages: [{ role: 'user', content: buildPrompt(dish.name) }],
    },
  }));

  console.log(`Submitting batch of ${requests.length} requests...`);
  const batch = await client.messages.batches.create({ requests });
  console.log(`Batch created: ${batch.id} (status: ${batch.processing_status})`);

  let current = batch;
  while (current.processing_status !== 'ended') {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    current = await client.messages.batches.retrieve(batch.id);
    const c = current.request_counts;
    console.log(
      `[poll] status=${current.processing_status} processing=${c.processing} succeeded=${c.succeeded} errored=${c.errored} canceled=${c.canceled} expired=${c.expired}`
    );
  }

  console.log('Batch finished. Fetching results...');
  const byCustomId = new Map(dishes.map((d, i) => [`dish-${i}`, d]));
  const rows = [];

  const results = await client.messages.batches.results(batch.id);
  for await (const line of results) {
    const dish = byCustomId.get(line.custom_id);
    const row = {
      custom_id: line.custom_id,
      name: dish?.name,
      category: dish?.category,
      status: line.result.type,
      flags: [],
      data: null,
    };

    if (line.result.type !== 'succeeded') {
      row.flags.push(line.result.type.toUpperCase());
      if (line.result.type === 'errored') {
        row.flags.push(`ERROR: ${line.result.error?.error?.message || JSON.stringify(line.result.error)}`);
      }
      rows.push(row);
      continue;
    }

    const message = line.result.message;
    if (message.stop_reason === 'max_tokens') row.flags.push('TRUNCATED');

    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) {
      row.flags.push('NO_TEXT_BLOCK');
      rows.push(row);
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(stripFence(textBlock.text));
    } catch {
      row.flags.push('PARSE_ERROR');
      row.rawText = textBlock.text;
      rows.push(row);
      continue;
    }

    if (parsed.error) {
      row.flags.push(`MODEL_ERROR: ${parsed.error}`);
      rows.push(row);
      continue;
    }

    const cal = Number(parsed.cal);
    const servingGrams = Number(parsed.servingGrams);
    const protein = Number(parsed.protein) || 0;
    const carbs = Number(parsed.carbs) || 0;
    const fat = Number(parsed.fat) || 0;

    if (!(cal > 0 && cal <= 3000)) row.flags.push('OUT_OF_RANGE:calories');
    if (!(servingGrams >= 10 && servingGrams <= 2000)) row.flags.push('OUT_OF_RANGE:servingGrams');
    const impliedCal = 4 * protein + 4 * carbs + 9 * fat;
    if (cal > 0 && Math.abs(impliedCal - cal) / cal > 0.25) row.flags.push('MACRO_MISMATCH');
    if (parsed.confidence === 'low') row.flags.push('LOW_CONFIDENCE');

    row.data = {
      name: parsed.name || dish?.name,
      serving_label: parsed.portion || '1 serving',
      serving_grams: Math.round(servingGrams) || null,
      calories: Math.round(cal) || 0,
      protein_g: Math.round(protein * 10) / 10,
      carbs_g: Math.round(carbs * 10) / 10,
      fat_g: Math.round(fat * 10) / 10,
      fibre_g: Math.round((Number(parsed.fibre) || 0) * 10) / 10,
      sodium_mg: Math.round(Number(parsed.sodium) || 0),
      sugar_g: Math.round((Number(parsed.sugar) || 0) * 10) / 10,
      confidence: parsed.confidence || 'medium',
    };
    rows.push(row);
  }

  // Results aren't guaranteed to come back in request order — sort by the
  // numeric suffix of custom_id so the review file reads in the same order
  // as dish-list.json, which is much easier to skim against it.
  rows.sort((a, b) => Number(a.custom_id.split('-')[1]) - Number(b.custom_id.split('-')[1]));

  const jsonPath = join(__dirname, 'dish-estimates-review.json');
  writeFileSync(jsonPath, JSON.stringify(rows, null, 2));

  const csvHeader = [
    'name', 'category', 'status', 'flags', 'serving_label', 'serving_grams',
    'calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sodium_mg', 'sugar_g', 'confidence',
  ];
  const csvLines = [csvHeader.join(',')];
  for (const row of rows) {
    const d = row.data || {};
    csvLines.push([
      csvEscape(row.name), csvEscape(row.category), csvEscape(row.status), csvEscape(row.flags.join('; ')),
      csvEscape(d.serving_label), csvEscape(d.serving_grams), csvEscape(d.calories), csvEscape(d.protein_g),
      csvEscape(d.carbs_g), csvEscape(d.fat_g), csvEscape(d.fibre_g), csvEscape(d.sodium_mg), csvEscape(d.sugar_g),
      csvEscape(d.confidence),
    ].join(','));
  }
  const csvPath = join(__dirname, 'dish-estimates-review.csv');
  writeFileSync(csvPath, csvLines.join('\n'));

  const flaggedCount = rows.filter((r) => r.flags.length > 0).length;
  const okCount = rows.length - flaggedCount;
  console.log(`\nWrote ${rows.length} rows to ${jsonPath} and ${csvPath}`);
  console.log(`  Clean: ${okCount}`);
  console.log(`  Flagged (needs a look): ${flaggedCount}`);
  const flagCounts = {};
  for (const row of rows) for (const f of row.flags) {
    const key = f.split(':')[0];
    flagCounts[key] = (flagCounts[key] || 0) + 1;
  }
  console.log('  Flag breakdown:', flagCounts);
}

main().catch((err) => {
  console.error('Batch generation failed:', err);
  process.exit(1);
});
