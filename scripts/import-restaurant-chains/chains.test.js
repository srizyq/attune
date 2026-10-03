import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Guards the hand-gathered restaurant data (chains/*.json) before it is imported
// into the database: the import script aborts on a duplicate id, the database has a
// unique index on (chain, lower(name), size), and wrong numbers are worse than
// missing ones — so every row that would be imported is sanity-checked here.
const dir = join(dirname(fileURLToPath(import.meta.url)), 'chains');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const chains = files.map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf-8')) }));
const importable = (c) => (c.items || []).filter((i) => !i._unverified);
const NUMERIC = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'sodium_mg', 'sugar_g', 'saturated_fat_g', 'trans_fat_g', 'serving_grams'];

describe('restaurant chain data files', () => {
  it('has chain files', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it.each(chains.map((c) => [c.file, c]))('%s is well-formed', (_file, c) => {
    expect(c.chain?.id, 'chain.id').toBeTruthy();
    expect(c.chain?.name, 'chain.name').toBeTruthy();
    expect(`${c.chain.id}.json`, 'file name matches chain.id').toBe(c.file);
    expect(c.chain.country).toBe('AU');
    for (const i of c.items || []) {
      expect(i.id.startsWith(`${c.chain.id}_`), `${i.id} is prefixed with its chain id`).toBe(true);
      expect(i.name?.trim(), `${i.id} has a name`).toBeTruthy();
      expect(i.serving_label?.trim(), `${i.id} has a serving label`).toBeTruthy();
      expect(i.source_url, `${i.id} cites a source`).toMatch(/^https?:\/\//);
      expect(i.verified_date, `${i.id} has a date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const f of NUMERIC) {
        if (i[f] == null) continue;
        expect(Number.isFinite(i[f]) && i[f] >= 0, `${i.id}.${f} = ${i[f]}`).toBe(true);
      }
      if (i._unverified) expect(i._unverified_reason, `${i.id} says why it is unverified`).toBeTruthy();
    }
  });

  it('has no duplicate ids anywhere (the import aborts on them)', () => {
    const seen = new Map();
    for (const c of chains) for (const i of c.items || []) {
      expect(seen.has(i.id), `duplicate id ${i.id} in ${c.file} and ${seen.get(i.id)}`).toBe(false);
      seen.set(i.id, c.file);
    }
  });

  it('has no two importable rows with the same chain, name and size (a database unique index)', () => {
    for (const c of chains) {
      const seen = new Set();
      for (const i of importable(c)) {
        const key = `${i.name.toLowerCase()}|${(i.size_label || '').toLowerCase()}`;
        expect(seen.has(key), `${c.file}: "${i.name}" ${i.size_label || ''} appears twice`).toBe(false);
        seen.add(key);
      }
    }
  });

  it('every row that would be imported has calories that roughly match its macros', () => {
    const problems = [];
    for (const c of chains) for (const i of importable(c)) {
      if (i.protein_g == null || i.carbs_g == null || i.fat_g == null) continue;
      const implied = 4 * i.protein_g + 4 * i.carbs_g + 9 * i.fat_g + 2 * (i.fibre_g || 0);
      // Alcohol and sugar alcohols aren't in these columns, so allow a wide margin; this catches typos, not rounding.
      if (Math.abs(implied - i.calories) > Math.max(60, 0.4 * i.calories)) problems.push(`${c.file}: ${i.name} (${i.size_label || '-'}) ${i.calories} kcal vs macros ${Math.round(implied)}`);
    }
    expect(problems).toEqual([]);
  });

  it('every row that would be imported is physically plausible for its serving weight', () => {
    const problems = [];
    for (const c of chains) for (const i of importable(c)) {
      const g = i.serving_grams;
      if (!g) continue;
      if (i.calories / g > 9.5) problems.push(`${c.file}: ${i.name} ${i.calories} kcal in ${g}g`);
      const macros = (i.protein_g || 0) + (i.carbs_g || 0) + (i.fat_g || 0);
      if (macros > g * 1.1 + 2) problems.push(`${c.file}: ${i.name} macros ${macros.toFixed(0)}g > ${g}g serving`);
      if (g > 6000) problems.push(`${c.file}: ${i.name} serving ${g}g`);
      if (i.calories > 5000) problems.push(`${c.file}: ${i.name} ${i.calories} kcal`);
    }
    expect(problems).toEqual([]);
  });
});
