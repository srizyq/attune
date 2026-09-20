// Builds supabase/pending-migrations.sql: every "schema update" block in
// supabase/schema.sql from "Coach consent + per-client invites" onward, in file
// order, as one file to paste into the Supabase SQL editor. It's generated so
// it can't drift from schema.sql (supabase/tests/migration-bundle.test.js fails
// if it does) — re-run this after changing any of those blocks:
//
//   node scripts/build-migration-bundle.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FIRST_BLOCK = 'Coach consent + per-client invites';

// The blocks that make up the bundle: [{ title, sql }] in file order.
export function bundleBlocks(schema) {
  const lines = schema.split('\n');
  const rules = lines.map((l, i) => (l.startsWith('-- ═══') ? i : -1)).filter((i) => i >= 0);
  if (rules.length % 2 !== 0) throw new Error('Unbalanced `-- ═══` header rules in schema.sql');
  const blocks = [];
  for (let k = 0; k < rules.length; k += 2) {
    const end = k + 2 < rules.length ? rules[k + 2] : lines.length;
    const header = lines.slice(rules[k] + 1, rules[k + 1]).map((l) => l.replace(/^--\s?/, '').trim()).filter(Boolean);
    blocks.push({ title: header[0].replace(/\s*\(schema update.*$/, '').replace(/\.$/, ''), sql: lines.slice(rules[k], end).join('\n').replace(/\s+$/, '') });
  }
  const first = blocks.findIndex((b) => b.title.startsWith(FIRST_BLOCK));
  if (first === -1) throw new Error(`Block "${FIRST_BLOCK}" not found`);
  return blocks.slice(first);
}

// The schema text before the first bundled block (what a database that already
// has everything older looks like).
export function baselineSql(schema) {
  const lines = schema.split('\n');
  const rules = lines.map((l, i) => (l.startsWith('-- ═══') ? i : -1)).filter((i) => i >= 0);
  for (let k = 0; k < rules.length; k += 2) {
    if (lines.slice(rules[k], rules[k + 1] + 1).join('\n').includes(FIRST_BLOCK)) return lines.slice(0, rules[k]).join('\n');
  }
  throw new Error(`Block "${FIRST_BLOCK}" not found`);
}

export function buildBundle(schema) {
  const blocks = bundleBlocks(schema);
  const header = [
    '-- ════════════════════════════════════════════════════════════════════════',
    '-- Attune — pending SQL updates',
    '--',
    '-- Generated from supabase/schema.sql by scripts/build-migration-bundle.mjs —',
    '-- do not edit by hand. Paste the whole file into the Supabase SQL editor and',
    '-- run it once. Every block is safe to re-run, so it does no harm if some of',
    '-- them were already applied. Nothing in the app breaks before you run it: each',
    '-- feature hides itself until its block is in.',
    '--',
    '-- Blocks, in order:',
    ...blocks.map((b, i) => `--   ${String(i + 1).padStart(2)}. ${b.title}`),
    '--',
    '-- Then run the three supabase/ausnut_micronutrients_backfill_partNof3.sql files',
    '-- (they fill in the food database for the "Extended micronutrients" block).',
    '-- ════════════════════════════════════════════════════════════════════════',
    '',
  ].join('\n');
  return `${header}\n${blocks.map((b) => b.sql).join('\n\n\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const schema = readFileSync(join(root, 'supabase', 'schema.sql'), 'utf8');
  const out = join(root, 'supabase', 'pending-migrations.sql');
  writeFileSync(out, buildBundle(schema));
  console.log(`Wrote ${out} (${bundleBlocks(schema).length} blocks)`);
}
