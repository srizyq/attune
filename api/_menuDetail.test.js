import { describe, it, expect } from 'vitest';
import { sanitizeDetail, detailPrompt, ALLERGENS } from './_menuDetail.js';

const good = {
  portions: [{ label: '1 regular wrap (~380g)', scale: 1 }, { label: 'Half', scale: 0.5 }],
  tweaks: [{ label: 'No cheese', cal: -90, protein: -5, carbs: 0, fat: -7 }],
  allergens: ['Dairy', 'gluten'],
  sodium_mg: 1180, fibre_g: 4, sugar_g: 6,
  source: { quote: 'Mixed wrap w/ frites', box: [400, 100, 450, 700] },
};

describe('sanitizeDetail', () => {
  it('passes a well-formed reply through, normalising allergen case', () => {
    const out = sanitizeDetail(good);
    expect(out.portions).toHaveLength(2);
    expect(out.allergens).toEqual(['Dairy', 'Gluten']);
    expect(out.tweaks[0]).toEqual({ label: 'No cheese', cal: -90, protein: -5, carbs: 0, fat: -7 });
    expect(out.sodium_mg).toBe(1180);
    expect(out.source).toEqual({ quote: 'Mixed wrap w/ frites', box: [400, 100, 450, 700] });
  });
  it('survives garbage without throwing', () => {
    for (const bad of [null, undefined, 'x', 42, [], {}, { portions: 'a', tweaks: {}, allergens: 5, source: 7 }]) {
      const out = sanitizeDetail(bad);
      expect(out.portions).toEqual([]);
      expect(out.tweaks).toEqual([]);
      expect(out.allergens).toEqual([]);
      expect(out.source.box).toBeNull();
    }
  });
  it('forces the first portion to scale 1 and clamps the rest', () => {
    const out = sanitizeDetail({ portions: [{ label: 'a', scale: 0.8 }, { label: 'b', scale: 99 }, { label: 'c', scale: -3 }] });
    expect(out.portions.map((p) => p.scale)).toEqual([1, 3, 0.1]);
  });
  it('drops the picker when there is only one portion', () => {
    expect(sanitizeDetail({ portions: [{ label: 'a', scale: 1 }] }).portions).toEqual([]);
  });
  it('drops allergens outside the known list and duplicates', () => {
    expect(sanitizeDetail({ allergens: ['Dairy', 'dairy', 'Lava', 'Soy'] }).allergens).toEqual(['Dairy', 'Soy']);
  });
  it('drops tweaks without a label and caps the count', () => {
    const tweaks = [{ label: '', cal: 1 }, ...Array.from({ length: 10 }, (_, i) => ({ label: `t${i}`, cal: -i }))];
    const out = sanitizeDetail({ tweaks });
    expect(out.tweaks).toHaveLength(6);
    expect(out.tweaks.every((t) => t.label)).toBe(true);
  });
  it('coerces non-numeric tweak deltas to 0', () => {
    expect(sanitizeDetail({ tweaks: [{ label: 'x', cal: 'abc', protein: null }] }).tweaks[0]).toMatchObject({ cal: 0, protein: 0 });
  });
  it('rejects an inverted, tiny or out-of-shape box, and clamps to the 0-1000 range', () => {
    expect(sanitizeDetail({ source: { box: [500, 100, 400, 700] } }).source.box).toBeNull();
    expect(sanitizeDetail({ source: { box: [100, 100, 105, 105] } }).source.box).toBeNull();
    expect(sanitizeDetail({ source: { box: [1, 2, 3] } }).source.box).toBeNull();
    expect(sanitizeDetail({ source: { box: [-50, 0, 500, 1400] } }).source.box).toEqual([0, 0, 500, 1000]);
  });
  it('treats missing or negative sodium/fibre/sugar as unknown', () => {
    const out = sanitizeDetail({ sodium_mg: -1, fibre_g: 'x' });
    expect([out.sodium_mg, out.fibre_g, out.sugar_g]).toEqual([null, null, null]);
  });
});

describe('detailPrompt', () => {
  it('embeds the pick and the allowed allergens', () => {
    const p = detailPrompt({ name: 'Wrap' });
    expect(p).toContain('"name":"Wrap"');
    for (const a of ALLERGENS) expect(p).toContain(a);
  });
});
