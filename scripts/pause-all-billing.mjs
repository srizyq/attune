// Pauses (or resumes) Stripe billing on every currently-subscribed account —
// the "stop existing subscribers from being charged too" half of a payments
// freeze. The other half (blocking anyone NEW from paying or claiming the
// free trial) is the app_settings.payments_frozen switch in the Supabase SQL
// editor (see schema.sql's "Payments freeze switch" block); this script
// flips that same switch so one command does both.
//
// Uses pause_collection rather than cancelling anything — a paused
// subscription keeps its billing cycle and stays intact in Stripe, it just
// stops generating invoices until resumed. Nobody's access or subscription
// is destroyed by running this.
//
// Usage:
//   node scripts/pause-all-billing.mjs freeze    --dry-run   (prints who would be paused, writes nothing)
//   node scripts/pause-all-billing.mjs freeze                (the real run)
//   node scripts/pause-all-billing.mjs unfreeze   [--dry-run] (resumes collection + unflips the switch)

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Same loader as scripts/import-ausnut/02-commit-to-db.mjs — reading
// .env.local directly rather than through a shell `source`/`export`, so a
// quoting slip can't print a raw secret straight to the terminal.
function loadDotEnvLocal() {
  const envPath = join(__dirname, '..', '.env.local');
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
const MODE = process.argv[2];

async function main() {
  if (MODE !== 'freeze' && MODE !== 'unfreeze') {
    console.error('Usage: node scripts/pause-all-billing.mjs <freeze|unfreeze> [--dry-run]');
    process.exit(1);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey || !stripeKey) {
    console.error('Missing VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or STRIPE_SECRET_KEY (set in .env.local or the environment).');
    console.error('These must be the LIVE production values — copy them from the Vercel project settings, not a test/dev key.');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const stripe = new Stripe(stripeKey);

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, name, stripe_pro_subscription_id, stripe_subscription_id')
    .or('stripe_pro_subscription_id.not.is.null,stripe_subscription_id.not.is.null');
  if (error) {
    console.error('Failed to load profiles:', error.message);
    process.exit(1);
  }

  const subs = [];
  for (const p of profiles || []) {
    if (p.stripe_pro_subscription_id) subs.push({ profileId: p.id, name: p.name, plan: 'pro', subId: p.stripe_pro_subscription_id });
    if (p.stripe_subscription_id) subs.push({ profileId: p.id, name: p.name, plan: 'coach', subId: p.stripe_subscription_id });
  }

  console.log(`Found ${subs.length} subscription(s) across ${(profiles || []).length} profile(s).`);
  if (subs.length === 0) { console.log('Nothing to do.'); return; }

  if (DRY_RUN) {
    console.log(`[dry-run] Would ${MODE === 'freeze' ? 'pause' : 'resume'} collection on:`);
    for (const s of subs) console.log(`  - ${s.subId} (${s.plan}, profile ${s.profileId}${s.name ? `, ${s.name}` : ''})`);
    console.log(`[dry-run] Would set app_settings.payments_frozen = ${MODE === 'freeze'}`);
    return;
  }

  const failures = [];
  let done = 0;
  for (const s of subs) {
    try {
      await stripe.subscriptions.update(s.subId, {
        // '' is Stripe's documented way to clear a nested param back to unset.
        pause_collection: MODE === 'freeze' ? { behavior: 'void' } : '',
      });
      done++;
    } catch (err) {
      failures.push({ ...s, message: err.message });
    }
  }

  const { error: settingsError } = await supabase
    .from('app_settings')
    .update({ payments_frozen: MODE === 'freeze' })
    .eq('id', true);

  console.log(`${MODE === 'freeze' ? 'Paused' : 'Resumed'} collection on ${done}/${subs.length} subscription(s).`);
  if (failures.length) {
    console.log(`${failures.length} failed:`);
    for (const f of failures) console.log(`  - ${f.subId} (${f.plan}, profile ${f.profileId}): ${f.message}`);
  }
  console.log(settingsError
    ? `Failed to update app_settings.payments_frozen: ${settingsError.message}`
    : `app_settings.payments_frozen is now ${MODE === 'freeze'}.`);

  if (failures.length || settingsError) process.exit(1);
}

main();
