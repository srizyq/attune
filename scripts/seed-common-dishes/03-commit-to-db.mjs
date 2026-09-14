// Gate 3 of the common-dishes seeding pipeline. Reads the (possibly
// hand-edited) dish-estimates-review.json from Gate 2 and upserts it into
// public.common_dishes via the service_role key (bypasses RLS — this table
// has no insert policy, by design, since it's admin-seeded not
// user-contributed). Only run this AFTER the schema in supabase/schema.sql
// (the "common_dishes" block) has been applied in the Supabase SQL editor.
//
// Rows whose generation failed/errored/was flagged with no `data` are
// skipped automatically — remove a row from the JSON entirely to exclude
// it for any other reason (that removal IS the rejection mechanism, no
// separate "excluded" flag needed).
//
// Usage:
//   node scripts/seed-common-dishes/03-commit-to-db.mjs --dry-run   (prints a summary, writes nothing)
//   node scripts/seed-common-dishes/03-commit-to-db.mjs             (the real run — safe to rerun, upserts on name)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 200;

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const reviewPath = join(__dirname, 'dish-estimates-review.json');
  const rows = JSON.parse(readFileSync(reviewPath, 'utf-8'));

  const toInsert = rows
    .filter((r) => r.status === 'succeeded' && r.data)
    .map((r) => ({
      // The curated list name, not the model's own "standardised name"
      // (r.data.name) — the model restates dish names in its own words,
      // which collapsed 22 distinct curated dishes into duplicate pairs
      // (e.g. "Chicken parma" and "Chicken parmigiana" both came back as
      // "Chicken parmigiana"). r.name is guaranteed unique by Gate 1's
      // dedup; the model's restated name isn't.
      name: r.name,
      category: r.category,
      serving_label: r.data.serving_label,
      serving_grams: r.data.serving_grams,
      calories: r.data.calories,
      protein_g: r.data.protein_g,
      carbs_g: r.data.carbs_g,
      fat_g: r.data.fat_g,
      fibre_g: r.data.fibre_g,
      sodium_mg: r.data.sodium_mg,
      sugar_g: r.data.sugar_g,
      confidence: r.data.confidence,
      source_model: 'claude-sonnet-5',
    }));

  const skipped = rows.length - toInsert.length;
  console.log(`${rows.length} rows in review file, ${toInsert.length} ready to commit, ${skipped} skipped (no usable data).`);

  // Fail fast, before any writes, if two rows would target the same `name`
  // — Postgres's ON CONFLICT DO UPDATE can't touch the same row twice in
  // one statement and errors out ("...cannot affect row a second time")
  // partway through a batch otherwise, which is a confusing way to
  // discover it. This bit for real the first time this script ran: r.name
  // is unique by construction (Gate 1's dedup), but a future hand-edit of
  // dish-estimates-review.json (renaming one row to match another, say)
  // could reintroduce it — this check makes that fail loudly up front
  // instead of mid-commit.
  const nameCounts = new Map();
  for (const row of toInsert) nameCounts.set(row.name, (nameCounts.get(row.name) || 0) + 1);
  const duplicateNames = [...nameCounts.entries()].filter(([, count]) => count > 1);
  if (duplicateNames.length > 0) {
    console.error(`\nAborting: ${duplicateNames.length} duplicate name(s) in dish-estimates-review.json — fix these before committing:`);
    for (const [name, count] of duplicateNames) console.error(`  ${count}x  "${name}"`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: writing nothing. First 5 rows that would be committed:');
    console.log(JSON.stringify(toInsert.slice(0, 5), null, 2));
    return;
  }

  let committed = 0;
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('common_dishes').upsert(batch, { onConflict: 'name' });
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }
    committed += batch.length;
    console.log(`Committed ${committed}/${toInsert.length}...`);
  }

  const { count, error: countError } = await supabase
    .from('common_dishes')
    .select('*', { count: 'exact', head: true });
  if (countError) {
    console.error('Commit finished, but the final count check failed:', countError.message);
    return;
  }
  console.log(`\nDone. public.common_dishes now has ${count} rows.`);
}

main().catch((err) => {
  console.error('Commit failed:', err);
  process.exit(1);
});
