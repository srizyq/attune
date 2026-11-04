import { describe, it, expect } from 'vitest';
import { contributorsFor, contributorsNote } from './nutrientContributors.js';

const items = [
  { id: 'a', name: 'Spinach', meal: 'lunch', vitaminC: 40, thiamin: null },
  { id: 'b', name: 'Orange', meal: 'breakfast', vitaminC: 60, thiamin: 0.1 },
  { id: 'c', name: 'Protein bar', meal: 'snacks', vitaminC: 0, thiamin: null },
  { id: 'd', name: 'Mystery stew', meal: 'dinner', vitaminC: 0, thiamin: null },
  { id: 'e', name: 'Plain rice', meal: 'dinner', vitaminC: 0, thiamin: 0 },
];
const estimates = new Map([['c', { micros: { vitaminC: 20, thiamin: 0.3 }, via: 'usda' }], ['d', { micros: { thiamin: 0 }, via: 'ai' }]]);

describe('contributorsFor', () => {
  it('lists foods biggest first, with their share of the total', () => {
    const r = contributorsFor('vitaminC', items, estimates);
    expect(r.rows.map((x) => x.name)).toEqual(['Orange', 'Spinach', 'Protein bar']);
    expect(r.total).toBe(120);
    expect(r.rows[0].share).toBeCloseTo(50);
    expect(r.rows.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100);
  });
  it('marks estimates, and keeps foods with no figure out of the total', () => {
    const r = contributorsFor('vitaminC', items, estimates);
    const bar = r.rows.find((x) => x.name === 'Protein bar');
    expect(bar).toMatchObject({ kind: 'estimated', via: 'usda', amount: 20 });
    expect(r.estimatedTotal).toBe(20);
    expect(r.unknown.map((x) => x.name)).toEqual(['Mystery stew', 'Plain rice']);
  });
  it('treats a measured 0 of an extended nutrient as none, not unknown', () => {
    const r = contributorsFor('thiamin', items, estimates);
    expect(r.rows.map((x) => x.name)).toEqual(['Protein bar', 'Orange']);
    expect(r.none.map((x) => x.name)).toEqual(['Mystery stew', 'Plain rice']); // an estimate of 0 and a real 0
    expect(r.unknown.map((x) => x.name)).toEqual(['Spinach']);
  });
  it('has nothing to show for an empty day', () => {
    const r = contributorsFor('iron', [], new Map());
    expect(r).toMatchObject({ rows: [], total: 0, count: 0 });
    expect(contributorsNote(r)).toBeNull();
  });
});

describe('contributorsNote', () => {
  it('says what was estimated and what has no data', () => {
    expect(contributorsNote(contributorsFor('vitaminC', items, estimates))).toBe('1 food is estimated from similar foods · 2 foods have no data, so this is a minimum.');
    expect(contributorsNote(contributorsFor('vitaminC', items.slice(0, 2), new Map()))).toBe('Every food logged carries this nutrient.');
  });
});
