import { describe, it, expect } from 'vitest';
import { sanitizePhotoExtras, sanitizeMenuExtras } from './_scanExtras.js';

describe('sanitizePhotoExtras', () => {
  it('keeps clean extras and clamps match to 0-100', () => {
    const out = sanitizePhotoExtras({
      name: 'Plate', insight: '  High in protein.  ',
      ingredients: [{ name: 'Salmon', grams: 170, match: 140.4, portion: '6 oz fillet' }, { name: 'Rice', match: -3 }],
    });
    expect(out.insight).toBe('High in protein.');
    expect(out.ingredients[0]).toMatchObject({ match: 100, portion: '6 oz fillet' });
    expect(out.ingredients[1].match).toBe(0);
  });
  it('drops fields the model got wrong instead of passing junk through', () => {
    const out = sanitizePhotoExtras({
      insight: 42, ingredients: [{ name: 'Rice', match: 'high', portion: { a: 1 } }],
    });
    expect('insight' in out).toBe(false);
    expect('match' in out.ingredients[0]).toBe(false);
    expect('portion' in out.ingredients[0]).toBe(false);
  });
  it('limits the insight length', () => {
    expect(sanitizePhotoExtras({ insight: 'x'.repeat(500), ingredients: [] }).insight).toHaveLength(220);
  });
  it('tolerates a missing ingredients array', () => {
    expect(sanitizePhotoExtras({ name: 'x' }).ingredients).toEqual([]);
  });
});

describe('sanitizeMenuExtras', () => {
  it('keeps restaurant, advice, prices, match and tips', () => {
    const out = sanitizeMenuExtras({
      restaurant: ' Sweetgreen ', advice: 'Go for the scallops.',
      items: [{ name: 'Burger', price: '$14.50' }, { name: 'Salad', price: 9 }],
      recommendations: [{ name: 'Scallops', match: 98, tip: 'Dressing on the side', price: '£34' }],
    });
    expect(out.restaurant).toBe('Sweetgreen');
    expect(out.items.map(i => i.price)).toEqual(['$14.50', '9']);
    expect(out.recommendations[0]).toMatchObject({ match: 98, tip: 'Dressing on the side', price: '£34' });
  });
  it('drops prices with no digits and junk match values', () => {
    const out = sanitizeMenuExtras({
      items: [{ name: 'Soup', price: 'market price' }],
      recommendations: [{ name: 'A', match: 'n/a', tip: '', price: null }],
    });
    expect('price' in out.items[0]).toBe(false);
    expect('match' in out.recommendations[0]).toBe(false);
    expect('tip' in out.recommendations[0]).toBe(false);
    expect('price' in out.recommendations[0]).toBe(false);
  });
  it('does not require any extras', () => {
    const out = sanitizeMenuExtras({ items: [], recommendations: [] });
    expect(out).toEqual({ items: [], recommendations: [] });
  });
});
