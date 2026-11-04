// Read-only: how many foods carry a real figure for each nutrient, per source.
// Usage: node scripts/audit-micro-coverage.mjs   (needs .env.local with the service key)
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq > 0 && !process.env[t.slice(0, eq)]) process.env[t.slice(0, eq)] = t.slice(eq + 1).replace(/^["']|["']$/g, '');
  }
}
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Column names of the nutrients that aren't always present (see src/lib/microNutrients.js).
const COLS = ['potassium_mg', 'vitamin_d_mcg', 'calcium_mg', 'iron_mg', 'vitamin_a_mcg', 'vitamin_c_mg', 'vitamin_b12_mcg', 'folate_mcg', 'magnesium_mg', 'zinc_mg',
  'saturated_fat_g', 'cholesterol_mg', 'thiamin_mg', 'riboflavin_mg', 'niacin_mg', 'vitamin_b6_mg', 'vitamin_e_mg', 'phosphorus_mg', 'selenium_mcg', 'iodine_mcg', 'omega3_mg'];

async function table(name, extra = '') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(name).select(`${COLS.join(',')}${extra}`).range(from, from + 999);
    if (error) { console.log(`${name}: ${error.message}`); return null; }
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
const has = (v) => v != null && Number(v) > 0;

function report(label, rows) {
  if (!rows) return;
  console.log(`\n${label}: ${rows.length} rows`);
  for (const c of COLS) console.log(`  ${c.padEnd(18)} ${String(rows.filter((r) => has(r[c])).length).padStart(7)}  ${(100 * rows.filter((r) => has(r[c])).length / rows.length).toFixed(0)}%`);
}

report('ausnut_foods', await table('ausnut_foods'));
const logs = await table('food_logs', ',source');
report('food_logs (all logged items)', logs);
if (logs) {
  const bySource = {};
  for (const r of logs) (bySource[r.source || 'unknown'] ||= []).push(r);
  for (const [s, rows] of Object.entries(bySource).sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
    const withAny = rows.filter((r) => COLS.slice(0, 10).some((c) => has(r[c]))).length;
    console.log(`  source ${s.padEnd(14)} ${String(rows.length).padStart(7)} logs · ${(100 * withAny / rows.length).toFixed(0)}% have any vitamin/mineral`);
  }
}
