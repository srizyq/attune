import { describe, it, expect } from 'vitest';
import { microTargetsToInputs, parseMicroTargetInputs, MAX_MICRO_TARGET } from './microTargets.js';
import { MICRO_NUTRIENTS } from './microNutrients.js';

describe('microTargetsToInputs', () => {
  it('gives every nutrient an input, blank unless a target is set', () => {
    const inputs = microTargetsToInputs({ fibre: 30, transFat: 0 });
    expect(Object.keys(inputs)).toHaveLength(MICRO_NUTRIENTS.length);
    expect(inputs.fibre).toBe('30');
    expect(inputs.transFat).toBe('0'); // zero is a target, not "unset"
    expect(inputs.iron).toBe('');
    expect(microTargetsToInputs(null).fibre).toBe('');
  });
});

describe('parseMicroTargetInputs', () => {
  it('keeps numbers, drops blanks, trims whitespace', () => {
    expect(parseMicroTargetInputs({ fibre: ' 30 ', sodium: '', iron: '12.5', transFat: '0' })).toEqual({ targets: { fibre: 30, iron: 12.5, transFat: 0 }, error: null });
  });
  it('round-trips through the form', () => {
    const stored = { fibre: 30, vitaminD: 12.5, transFat: 0 };
    expect(parseMicroTargetInputs(microTargetsToInputs(stored)).targets).toEqual(stored);
  });
  it('names the nutrient and the problem for bad input', () => {
    expect(parseMicroTargetInputs({ fibre: 'lots' }).error).toBe('Fibre must be a number between 0 and 100,000.');
    expect(parseMicroTargetInputs({ sodium: '-5' }).error).toMatch(/^Sodium/);
    expect(parseMicroTargetInputs({ iron: String(MAX_MICRO_TARGET + 1) }).error).toMatch(/^Iron/);
    expect(parseMicroTargetInputs({ zinc: 'Infinity' }).error).toMatch(/^Zinc/);
    expect(parseMicroTargetInputs({ zinc: 'NaN' }).targets).toBeNull();
  });
  it('accepts the limits themselves, and an empty form', () => {
    expect(parseMicroTargetInputs({ fibre: '0', sodium: String(MAX_MICRO_TARGET) }).targets).toEqual({ fibre: 0, sodium: MAX_MICRO_TARGET });
    expect(parseMicroTargetInputs({})).toEqual({ targets: {}, error: null });
    expect(parseMicroTargetInputs(undefined)).toEqual({ targets: {}, error: null });
  });
});
