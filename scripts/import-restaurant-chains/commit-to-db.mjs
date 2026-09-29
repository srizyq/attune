// Reads every chains/*.json file (one per restaurant chain — see supabase/
// schema.sql's "Restaurant chains" block for the tables this fills) and
// upserts them into public.restaurant_chains, public.restaurant_items and
// public.restaurant_components via the service_role key (bypasses RLS —
// these tables have no insert policy, admin-populated only, same posture
// as ausnut_foods/common_dishes).
//
// Each chain file's `items`/`components` rows don't carry chain_id/
// chain_name themselves (restaurant_items) or a redundant chain_id
// (restaurant_components already has one, but it's overwritten from the
// file's own `chain.id` here rather than trusted, in case it ever drifts)
// — both get stamped from the file's own top-level `chain` object, so a
// chain's id/name only has to be right in one place per file.
//
// Any item/component whose `_unverified` field is true is skipped (with a
// warning) rather than committed — see e.g. chains/mcdonalds-au.json's
// McCrispy entry, which also carries an `_unverified_reason` explaining
// what's still unresolved. Remove the flag once a source confirms it.
// Any other underscore-prefixed key is also stripped before insert (a
// hook for future draft-only annotations without touching the schema).
//
// Requires the "Restaurant chains" block in supabase/schema.sql to already
// be applied in the Supabase SQL editor.
//
// Usage:
//   node scripts/import-restaurant-chains/commit-to-db.mjs --dry-run   (prints a summary, writes nothing)
//   node scripts/import-restaurant-chains/commit-to-db.mjs             (the real run — safe to rerun, upserts on id)

import { readFileSync, readdirSync, existsSync } from 'node:fs';
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
const BATCH_SIZE = 200;

// Strips any underscore-prefixed key (draft-only annotations like
// _unverified/_unverified_reason — never real columns) before a row is
// sent to Supabase.
function stripDraftKeys(row) {
  return Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')));
}

function failOnDuplicateIds(rows, label) {
  const counts = new Map();
  for (const r of rows) counts.set(r.id, (counts.get(r.id) || 0) + 1);
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    console.error(`\nAborting: ${duplicates.length} duplicate id(s) in ${label} — fix these before committing:`);
    for (const [id, count] of duplicates) console.error(`  ${count}x  "${id}"`);
    process.exit(1);
  }
}

async function upsertBatched(supabase, table, rows) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`${table} batch ${i / BATCH_SIZE + 1} failed:`, error.message);
      process.exit(1);
    }
    console.log(`  ${table}: committed ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length}`);
  }
}

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase = createClient(supabaseUrl, serviceKey);

  const chainsDir = join(__dirname, 'chains');
  const files = readdirSync(chainsDir).filter((f) => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error(`No chain files found in ${chainsDir}`);
    process.exit(1);
  }

  const chainRows = [];
  const itemRows = [];
  const componentRows = [];
  const skippedUnverified = [];

  for (const file of files) {
    const data = JSON.parse(readFileSync(join(chainsDir, file), 'utf-8'));
    const { chain, items = [], components = [] } = data;
    if (!chain?.id || !chain?.name) {
      console.error(`Aborting: ${file} has no chain.id/chain.name`);
      process.exit(1);
    }
    chainRows.push(stripDraftKeys(chain));

    for (const item of items) {
      if (item._unverified) {
        skippedUnverified.push(`${chain.name} — ${item.name} (restaurant_items)`);
        continue;
      }
      itemRows.push(stripDraftKeys({ ...item, chain_id: chain.id, chain_name: chain.name }));
    }
    for (const c of components) {
      if (c._unverified) {
        skippedUnverified.push(`${chain.name} — ${c.name} (restaurant_components)`);
        continue;
      }
      componentRows.push(stripDraftKeys({ ...c, chain_id: chain.id }));
    }
  }

  failOnDuplicateIds(chainRows, 'restaurant_chains (across all chain files)');
  failOnDuplicateIds(itemRows, 'restaurant_items (across all chain files)');
  failOnDuplicateIds(componentRows, 'restaurant_components (across all chain files)');

  console.log(`${files.length} chain file(s): ${chainRows.length} chains, ${itemRows.length} items, ${componentRows.length} components ready to commit.`);
  if (skippedUnverified.length > 0) {
    console.log(`\n${skippedUnverified.length} row(s) skipped (_unverified: true) — resolve and re-run to include:`);
    for (const s of skippedUnverified) console.log(`  - ${s}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: writing nothing. First chain and first item/component that would be committed:');
    console.log(JSON.stringify(chainRows[0], null, 2));
    if (itemRows[0]) console.log(JSON.stringify(itemRows[0], null, 2));
    if (componentRows[0]) console.log(JSON.stringify(componentRows[0], null, 2));
    return;
  }

  console.log('\nCommitting...');
  // Chains first — restaurant_items/restaurant_components.chain_id both
  // reference restaurant_chains.id, so the parent row must exist first.
  await upsertBatched(supabase, 'restaurant_chains', chainRows);
  await upsertBatched(supabase, 'restaurant_items', itemRows);
  await upsertBatched(supabase, 'restaurant_components', componentRows);

  for (const table of ['restaurant_chains', 'restaurant_items', 'restaurant_components']) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.error(`Commit finished, but the final count check for ${table} failed:`, error.message);
      continue;
    }
    console.log(`public.${table} now has ${count} rows.`);
  }
}

main().catch((err) => {
  console.error('Commit failed:', err);
  process.exit(1);
});
