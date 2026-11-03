import { describe, it, expect } from 'vitest';
import { macroKcal, calorieMatch, matchTone, labelToForm, weightStep } from './customFood';

describe('macroKcal', () => {
  it('adds protein and carbs at 4 per gram and fat at 9', () => {
    expect(macroKcal({ protein: 32, carbs: 44, fat: 18 })).toEqual({ protein: 128, carbs: 176, fat: 162, total: 466 });
  });
  it('treats blanks, junk and negatives as nothing', () => {
    expect(macroKcal({ protein: '', carbs: 'abc', fat: -5 })).toEqual({ protein: 0, carbs: 0, fat: 0, total: 0 });
    expect(macroKcal()).toEqual({ protein: 0, carbs: 0, fat: 0, total: 0 });
  });
  it('accepts text from the inputs and rounds', () => {
    expect(macroKcal({ protein: '10.5', carbs: '0', fat: '1.2' }).total).toBe(42 + 11);
  });
});

describe('calorieMatch', () => {
  it('is 100 when they agree and falls as they drift apart, either way round', () => {
    expect(calorieMatch(480, 480)).toBe(100);
    expect(calorieMatch(400, 500)).toBe(80);
    expect(calorieMatch(500, 400)).toBe(80);
  });
  it('is null with nothing to compare and 0 when only one side has a number', () => {
    expect(calorieMatch('', 0)).toBeNull();
    expect(calorieMatch(300, 0)).toBe(0);
    expect(calorieMatch('', 300)).toBe(0);
  });
  it('is described in three steps', () => {
    expect(matchTone(100)).toBe('good');
    expect(matchTone(90)).toBe('good');
    expect(matchTone(80)).toBe('close');
    expect(matchTone(50)).toBe('off');
    expect(matchTone(null)).toBe('none');
  });
});

describe('labelToForm', () => {
  it('turns the reader\'s reply into form text, leaving missing numbers empty', () => {
    expect(labelToForm({ serving: '1 bar (40g)', servingGrams: 40, cal: 190, protein: 12, carbs: 18, fat: 8, fibre: 3, sodium: 120, sugar: 5 }))
      .toEqual({ servingLabel: '1 bar (40g)', servingGrams: '40', cal: '190', protein: '12', carbs: '18', fat: '8', fibre: '3', sodium: '120', sugar: '5' });
    const sparse = labelToForm({ cal: 100, protein: 0 });
    expect(sparse.cal).toBe('100');
    expect(sparse.protein).toBe('0');
    expect(sparse.fibre).toBe('');
    expect(sparse.servingLabel).toBe('');
    expect(labelToForm()).toMatchObject({ cal: '', servingGrams: '' });
  });
});

describe('weightStep', () => {
  it('gets bigger as the weight does', () => {
    expect([0, 50, 99, 100, 250, 499, 500, 2000].map(weightStep)).toEqual([5, 5, 5, 10, 10, 10, 25, 25]);
  });
});
