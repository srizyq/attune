import { describe, it, expect } from 'vitest';
import { toKcal, fromKcal, kcalFromMacros, KJ_PER_KCAL } from './energy';

describe('energy units', () => {
  it('leaves kcal alone and converts kJ', () => {
    expect(toKcal('250', 'kcal')).toBe(250);
    expect(toKcal('1046', 'kJ')).toBe(250);
    expect(toKcal(1500, 'kJ')).toBe(Math.round(1500 / KJ_PER_KCAL));
  });
  it('reads blank, negative or junk as 0', () => {
    expect(toKcal('', 'kJ')).toBe(0);
    expect(toKcal('-5')).toBe(0);
    expect(toKcal('abc', 'kcal')).toBe(0);
  });
  it('converts back to the chosen unit', () => {
    expect(fromKcal(250, 'kJ')).toBe(1046);
    expect(fromKcal(250, 'kcal')).toBe(250);
    expect(fromKcal(null, 'kJ')).toBe(0);
  });
  it('works out calories from macros', () => {
    expect(kcalFromMacros({ protein: 10, carbs: 20, fat: 5 })).toBe(165);
    expect(kcalFromMacros({ protein: '', carbs: 'x', fat: null })).toBe(0);
  });
});
