import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PROVENANCE, BY_SOURCE, GENERIC_SOURCES, provenanceOf, provenanceBreakdown, describeBreakdown } from './provenance.js';

describe('provenanceOf', () => {
  it('groups each known source into a tier', () => {
    expect(provenanceOf('ausnut')).toBe('verified');
    expect(provenanceOf('fatsecret')).toBe('database');
    expect(['off', 'community'].map(provenanceOf)).toEqual(['community', 'community']);
    expect(['ai-estimate', 'photo', 'menu', 'common-dish'].map(provenanceOf)).toEqual(['ai', 'ai', 'ai', 'ai']);
    expect(provenanceOf('custom')).toBe('custom');
    expect(provenanceOf('recipe')).toBe('recipe');
  });
  it('is case-insensitive and never throws on odd input', () => {
    expect(provenanceOf('AUSNUT')).toBe('verified');
    for (const v of [null, undefined, '', 42, {}, 'usda-from-the-future']) expect(provenanceOf(v)).toBe('unknown');
    for (const g of GENERIC_SOURCES) expect(provenanceOf(g)).toBe('unknown');
  });
  it('every tier used by a source is defined', () => {
    for (const tier of Object.values(BY_SOURCE)) expect(PROVENANCE[tier], tier).toBeTruthy();
  });
});

// If a new data source gets logged without a provenance decision, it would
// silently show as "Unspecified" — exactly where a coach needs to know.
describe('covers every source the app can log', () => {
  const code = readFileSync(new URL('../pages/FoodSearch.jsx', import.meta.url), 'utf8');
  const used = [...new Set([...code.matchAll(/\bsource:\s*['"]([\w-]+)['"]/g)].map(m => m[1]))];
  it('found the sources in FoodSearch.jsx', () => {
    expect(used.length).toBeGreaterThan(5);
  });
  it.each(used)('"%s" has a tier (or is a known generic fallback)', (s) => {
    expect(BY_SOURCE[s] || GENERIC_SOURCES.includes(s), `unmapped source "${s}" — add it to BY_SOURCE in src/lib/provenance.js`).toBeTruthy();
  });
});

describe('provenanceBreakdown', () => {
  const rows = [
    { calories: 500, source: 'ausnut' },
    { calories: 300, source: 'fatsecret' },
    { calories: 200, source: 'photo' },
  ];
  it('weights by calories, largest first, adding to exactly 100', () => {
    const b = provenanceBreakdown(rows);
    expect(b.map(x => [x.key, x.pct])).toEqual([['verified', 50], ['database', 30], ['ai', 20]]);
    expect(b.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });
  it('folds sources in the same tier together', () => {
    const b = provenanceBreakdown([{ calories: 100, source: 'photo' }, { calories: 100, source: 'menu' }, { calories: 100, source: 'ausnut' }]);
    expect(b.map(x => [x.key, x.pct])).toEqual([['ai', 67], ['verified', 33]]);
  });
  it('still adds to 100 when the shares do not divide evenly', () => {
    const b = provenanceBreakdown([{ calories: 1, source: 'ausnut' }, { calories: 1, source: 'photo' }, { calories: 1, source: 'off' }]);
    expect(b.reduce((s, x) => s + x.pct, 0)).toBe(100);
  });
  it('ignores zero-calorie and malformed rows, and returns [] when there is nothing to weigh', () => {
    expect(provenanceBreakdown([{ calories: 0, source: 'photo' }, { calories: 'x', source: 'photo' }])).toEqual([]);
    expect(provenanceBreakdown([])).toEqual([]);
    expect(provenanceBreakdown(undefined)).toEqual([]);
  });
  it('treats an untagged row as unspecified rather than dropping it', () => {
    expect(provenanceBreakdown([{ calories: 100 }])).toEqual([{ key: 'unknown', calories: 100, pct: 100 }]);
  });
  it('accepts custom accessors (the app\'s mapped items use cal, not calories)', () => {
    const b = provenanceBreakdown([{ cal: 100, source: 'photo' }], (r) => r.cal);
    expect(b[0].key).toBe('ai');
  });
});

describe('describeBreakdown', () => {
  it('reads as one line', () => {
    expect(describeBreakdown(provenanceBreakdown([{ calories: 700, source: 'ausnut' }, { calories: 300, source: 'photo' }]))).toBe('70% verified · 30% ai estimate');
  });
});
