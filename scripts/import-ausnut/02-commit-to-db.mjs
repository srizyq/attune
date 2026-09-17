// Reads ausnut-foods.json (written by 01-parse-xlsx.py) and replaces the
// full contents of public.ausnut_foods via the service_role key (bypasses
// RLS — this table has no insert policy, admin-populated only). Truncates
// first since this is a full-table replace, not an incremental add — safe
// to rerun any time the source spreadsheet changes.
//
// Requires the "ausnut_foods" block in supabase/schema.sql to already be
// applied in the Supabase SQL editor.
//
// Usage:
//   node scripts/import-ausnut/02-commit-to-db.mjs --dry-run   (prints a summary, writes nothing)
//   node scripts/import-ausnut/02-commit-to-db.mjs             (the real run)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Loads .env.local directly rather than through a shell `source`/`export`
// — a quoting slip there once printed a raw secret straight to the
// terminal the moment the shell choked on a line.
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
const BATCH_SIZE = 500;

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const foodsPath = join(__dirname, 'ausnut-foods.json');
  const foods = JSON.parse(readFileSync(foodsPath, 'utf-8'));

  const ids = new Set();
  for (const f of foods) {
    if (ids.has(f.id)) {
      console.error(`Aborting: duplicate id "${f.id}" in ausnut-foods.json`);
      process.exit(1);
    }
    ids.add(f.id);
  }

  console.log(`${foods.length} foods loaded from ausnut-foods.json.`);

  if (DRY_RUN) {
    console.log('\n--dry-run: writing nothing. First 5 rows that would be committed:');
    console.log(JSON.stringify(foods.slice(0, 5), null, 2));
    return;
  }

  console.log('Truncating public.ausnut_foods...');
  const { error: deleteError } = await supabase.from('ausnut_foods').delete().not('id', 'is', null);
  if (deleteError) {
    console.error('Truncate failed:', deleteError.message);
    process.exit(1);
  }

  let committed = 0;
  for (let i = 0; i < foods.length; i += BATCH_SIZE) {
    const batch = foods.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('ausnut_foods').insert(batch);
    if (error) {
      console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }
    committed += batch.length;
    console.log(`Committed ${committed}/${foods.length}...`);
  }

  const { count, error: countError } = await supabase
    .from('ausnut_foods')
    .select('*', { count: 'exact', head: true });
  if (countError) {
    console.error('Commit finished, but the final count check failed:', countError.message);
    return;
  }
  console.log(`\nDone. public.ausnut_foods now has ${count} rows.`);
}

main().catch((err) => {
  console.error('Commit failed:', err);
  process.exit(1);
});
