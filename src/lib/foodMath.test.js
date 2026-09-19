import { describe, it, expect } from 'vitest';
import {
  amountToServings, gramsPerServing, initialEditState, editUnitsFor, editServings,
  formatAmountUnit, scaleFood,
} from './foodMath';

const base = { cal: 200, protein: 10, carbs: 20, fat: 5 };
// A 60g bar logged as "1 serving".
const oneServing = { ...base, servingGrams: 60, loggedAmount: 1, loggedUnit: 'serving' };

describe('initialEditState — opens on what the item was saved as', () => {
  it('serving item opens as serving, not grams (the reported bug)', () => {
    expect(initialEditState(oneServing)).toEqual({ amount: '1', unit: 'serving' });
  });
  it('fractional servings', () => {
    const item = { ...base, servingGrams: 30, loggedAmount: 0.5, loggedUnit: 'serving' };
    expect(initialEditState(item)).toEqual({ amount: '0.5', unit: 'serving' });
  });
  it.each(['g', 'kg', 'lb', 'oz', 'ml'])('%s item opens in %s', unit => {
    const item = { ...base, servingGrams: 250, loggedAmount: 2, loggedUnit: unit };
    expect(initialEditState(item)).toEqual({ amount: '2', unit });
  });
  it('legacy item with a weight but no saved unit falls back to grams', () => {
    expect(initialEditState({ ...base, servingGrams: 120 })).toEqual({ amount: '120', unit: 'g' });
  });
  it('unrecognised saved unit falls back to grams instead of crashing', () => {
    const item = { ...base, servingGrams: 120, loggedAmount: 1, loggedUnit: 'cup' };
    expect(initialEditState(item)).toEqual({ amount: '120', unit: 'g' });
    expect(editServings(item, '120', 'cup')).toBe(0);
  });
  it('serving unit with a zero/missing amount falls back to grams', () => {
    expect(initialEditState({ ...oneServing, loggedAmount: 0 })).toEqual({ amount: '60', unit: 'g' });
    expect(initialEditState({ ...oneServing, loggedAmount: null })).toEqual({ amount: '60', unit: 'g' });
  });
  it('item with no weight anchors to calories', () => {
    expect(initialEditState(base)).toEqual({ amount: '200', unit: 'serving' });
  });
});

describe('editUnitsFor', () => {
  it('offers serving only when the item was saved in servings', () => {
    expect(editUnitsFor(oneServing).map(u => u.id)).toContain('serving');
    expect(editUnitsFor({ ...oneServing, loggedUnit: 'g', loggedAmount: 60 }).map(u => u.id)).not.toContain('serving');
  });
  it('weight-less items only offer serving', () => {
    expect(editUnitsFor(base).map(u => u.id)).toEqual(['serving']);
  });
  it('the opening unit is always one of the offered units', () => {
    const items = [
      oneServing, base,
      { ...base, servingGrams: 60, loggedAmount: 3, loggedUnit: 'oz' },
      { ...base, servingGrams: 60 },
      { ...base, servingGrams: 60, loggedAmount: 1, loggedUnit: 'cup' },
      { ...oneServing, loggedAmount: 0 },
    ];
    for (const item of items) {
      const { unit } = initialEditState(item);
      expect(editUnitsFor(item).map(u => u.id)).toContain(unit);
    }
  });
});

describe('editServings', () => {
  it('typing the saved amount back is a no-op (multiplier 1)', () => {
    expect(editServings(oneServing, '1', 'serving')).toBeCloseTo(1);
    expect(editServings({ ...base, servingGrams: 250, loggedAmount: 250, loggedUnit: 'g' }, '250', 'g')).toBeCloseTo(1);
    expect(editServings(base, '200', 'serving')).toBeCloseTo(1);
  });
  it('2 servings of a 60g serving doubles everything', () => {
    const m = editServings(oneServing, '2', 'serving');
    expect(m).toBeCloseTo(2);
    expect(scaleFood(oneServing, m).cal).toBe(400);
  });
  it('switching units within one edit is consistent (60g === 1 serving)', () => {
    expect(editServings(oneServing, '60', 'g')).toBeCloseTo(editServings(oneServing, '1', 'serving'));
    expect(editServings(oneServing, '0.06', 'kg')).toBeCloseTo(1);
  });
  it('empty / zero / garbage input gives 0 so Save stays disabled', () => {
    for (const v of ['', '0', 'abc', '-3']) {
      expect(editServings(oneServing, v, 'serving')).toBe(0);
      expect(editServings(base, v, 'serving')).toBe(0);
    }
  });
});

// Simulates LogItemRow's save: persisted servingGrams/loggedAmount/loggedUnit
// come from the edit, then the next edit starts from those.
function save(item, amount, unit) {
  const m = editServings(item, amount, unit);
  return { ...scaleFood(item, m), servingGrams: Math.round(m * item.servingGrams), loggedAmount: Number(amount), loggedUnit: unit };
}

describe('repeated edits never compound', () => {
  it('serving edits keep the same grams-per-serving', () => {
    let item = oneServing;
    for (const n of ['3', '2', '1', '4']) {
      item = save(item, n, 'serving');
      expect(gramsPerServing(item)).toBeCloseTo(60);
      expect(item.cal).toBe(200 * Number(n));
    }
  });
  it('re-saving the opening values changes nothing, however many times', () => {
    let item = oneServing;
    for (let i = 0; i < 5; i++) {
      const { amount, unit } = initialEditState(item);
      item = save(item, amount, unit);
    }
    expect(item.cal).toBe(200);
    expect(item.servingGrams).toBe(60);
  });
  it('switching a serving item to grams then re-saving is stable', () => {
    let item = save(oneServing, '120', 'g');
    expect(item.cal).toBe(400);
    const { amount, unit } = initialEditState(item);
    expect({ amount, unit }).toEqual({ amount: '120', unit: 'g' });
    item = save(item, amount, unit);
    expect(item.cal).toBe(400);
  });
});

describe('helpers', () => {
  it('amountToServings ignores unknown units instead of throwing', () => {
    expect(amountToServings(5, 'cup', 100)).toBe(0);
  });
  it('formatAmountUnit', () => {
    expect(formatAmountUnit(1, 'serving')).toBe('1 serving');
    expect(formatAmountUnit(2, 'serving')).toBe('2 servings');
    expect(formatAmountUnit(250, 'g')).toBe('250g');
    expect(formatAmountUnit(3, 'nope')).toBe('3');
  });
});
