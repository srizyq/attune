import { describe, it, expect } from 'vitest';
import { toggleGroup, rowsToCopy, COPY_DEST_SAME } from './copyMeals';

const rows = [
  { id: 'a', meal: 'lunch', food_name: 'Chicken', logged_at: '2026-10-02T02:30:00Z' },
  { id: 'b', meal: 'lunch', food_name: 'Rice', logged_at: null },
  { id: 'c', meal: 'dinner', food_name: 'Soup', logged_at: null },
];

describe('toggleGroup', () => {
  it('ticks everything when none are ticked', () => {
    expect([...toggleGroup(new Set(), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });
  it('fills in a partly-ticked group instead of clearing it', () => {
    expect([...toggleGroup(new Set(['a']), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });
  it('unticks the whole group when all of it is ticked, leaving other groups alone', () => {
    expect([...toggleGroup(new Set(['a', 'b', 'c']), ['a', 'b'])]).toEqual(['c']);
  });
  it('does not mutate the set it was given', () => {
    const original = new Set(['a']);
    toggleGroup(original, ['a', 'b']);
    expect([...original]).toEqual(['a']);
  });
  it('does nothing for an empty group', () => {
    expect([...toggleGroup(new Set(['a']), [])]).toEqual(['a']);
  });
});

describe('rowsToCopy', () => {
  it('returns only the ticked rows', () => {
    expect(rowsToCopy(rows, new Set(['a', 'c'])).map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('returns nothing when nothing is ticked', () => {
    expect(rowsToCopy(rows, new Set())).toEqual([]);
  });
  it('passes rows through untouched for "same meal"', () => {
    const out = rowsToCopy(rows, new Set(['a']), COPY_DEST_SAME);
    expect(out[0]).toBe(rows[0]);
    expect(out[0].logged_at).toBe('2026-10-02T02:30:00Z');
  });
  it('moves ticked rows into the chosen meal and clears their time of day', () => {
    const out = rowsToCopy(rows, new Set(['a', 'b']), 'dinner');
    expect(out.map((r) => [r.meal, r.logged_at])).toEqual([['dinner', null], ['dinner', null]]);
  });
  it('leaves rows already in the chosen meal untouched, keeping their time', () => {
    const out = rowsToCopy(rows, new Set(['a']), 'lunch');
    expect(out[0]).toBe(rows[0]);
  });
  it('never changes the source rows', () => {
    rowsToCopy(rows, new Set(['a']), 'snacks');
    expect(rows[0].meal).toBe('lunch');
    expect(rows[0].logged_at).toBe('2026-10-02T02:30:00Z');
  });
});
