import { describe, it, expect } from 'vitest';
import { cleanItems, buildMicrosPrompt, parseMicros, AI_MICRO_NUTRIENTS, MAX_ITEMS } from './_aiMicros.js';

describe('cleanItems', () => {
  it('keeps names, brands and positive numbers, drops the rest', () => {
    expect(cleanItems([{ name: '  Chicken   curry ', brand: 'Home', grams: '250.04', cal: -5 }, { name: '' }, null]))
      .toEqual([{ name: 'Chicken curry', brand: 'Home', grams: 250, cal: null }]);
  });
  it('caps the number of foods and rejects non-lists', () => {
    expect(cleanItems(Array.from({ length: 20 }, (_, i) => ({ name: `f${i}` })))).toHaveLength(MAX_ITEMS);
    expect(cleanItems('nope')).toBeNull();
    expect(cleanItems([])).toBeNull();
  });
});

describe('buildMicrosPrompt', () => {
  it('lists each food with its portion and every estimated nutrient with its unit, but never fibre, sodium or sugar', () => {
    const p = buildMicrosPrompt([{ name: 'Laksa', brand: '', grams: 400, cal: 520 }]);
    expect(p).toContain('1. Laksa — the portion eaten: 400 g, 520 kcal');
    expect(p).toContain('"vitaminB12" (mcg)');
    expect(p).toContain('"magnesium" (mg)');
    expect(p).not.toContain('"fibre"');
    expect(p).not.toContain('"sodium"');
  });
});

describe('parseMicros', () => {
  it('keeps only known nutrients with sensible numbers, one object per food', () => {
    const out = parseMicros('```json\n{"items":[{"vitaminC":12.34567,"zinc":"2","bogus":5,"iron":-1,"calcium":null,"folate":"x"}]}\n```', 2);
    expect(out[0]).toEqual({ vitaminC: 12.346, zinc: 2 });
    expect(out[1]).toEqual({});
  });
  it('throws on a reply that is not JSON, so the endpoint can report it', () => {
    expect(() => parseMicros('Sorry, I cannot', 1)).toThrow();
  });
  it('estimates every nutrient except the three every source carries', () => {
    expect(AI_MICRO_NUTRIENTS.map((m) => m.key)).not.toContain('sugar');
    expect(AI_MICRO_NUTRIENTS.length).toBeGreaterThan(25);
  });
});
