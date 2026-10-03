import { describe, it, expect } from 'vitest';
import { adjustPick, tweakChipLabel, includesLine, loggedName, cropRect } from './menuTweaks';

const base = { cal: 700, protein: 30, carbs: 58, fat: 40 };

describe('adjustPick', () => {
  it('returns the estimate unchanged with no portion or tweaks', () => {
    expect(adjustPick(base, null, [])).toEqual({ cal: 700, protein: 30, carbs: 58, fat: 40 });
  });
  it('applies tweak deltas', () => {
    const out = adjustPick(base, null, [{ cal: -90, protein: -5, carbs: 0, fat: -7 }]);
    expect(out).toEqual({ cal: 610, protein: 25, carbs: 58, fat: 33 });
  });
  it('scales by portion after applying tweaks', () => {
    const out = adjustPick(base, { scale: 0.5 }, [{ cal: -100 }]);
    expect(out.cal).toBe(300);
  });
  it('never goes below zero', () => {
    expect(adjustPick({ cal: 50, protein: 1, carbs: 1, fat: 1 }, null, [{ cal: -200, protein: -9 }]).cal).toBe(0);
    expect(adjustPick({ cal: 50, protein: 1, carbs: 1, fat: 1 }, null, [{ cal: -200, protein: -9 }]).protein).toBe(0);
  });
  it('ignores a nonsense portion scale', () => {
    expect(adjustPick(base, { scale: 0 }, []).cal).toBe(700);
    expect(adjustPick(base, { scale: NaN }, []).cal).toBe(700);
  });
  it('scales sodium/fibre/sugar by portion only', () => {
    const out = adjustPick(base, { scale: 2 }, [{ cal: -100 }], { sodium_mg: 500, fibre_g: 3, sugar_g: 4.5 });
    expect([out.sodium, out.fibre, out.sugar]).toEqual([1000, 6, 9]);
  });
  it('leaves extras off when none are given', () => {
    expect(adjustPick(base, null, [], null)).not.toHaveProperty('sodium');
  });
});

describe('tweakChipLabel', () => {
  it('shows the kcal change with its sign', () => {
    expect(tweakChipLabel({ label: 'No cheese', cal: -90 })).toBe('No cheese (-90 kcal)');
    expect(tweakChipLabel({ label: 'Add bacon', cal: 80 })).toBe('Add bacon (+80 kcal)');
  });
  it('omits a zero change', () => {
    expect(tweakChipLabel({ label: 'Sauce on side', cal: 0 })).toBe('Sauce on side');
  });
});

describe('includesLine', () => {
  it('joins allergens and a high-sodium flag', () => {
    expect(includesLine(['Dairy', 'Gluten'], 1180)).toBe('Includes Dairy, Gluten • High sodium (1,180mg)');
  });
  it('omits sodium when it is not high', () => {
    expect(includesLine(['Dairy'], 300)).toBe('Includes Dairy');
  });
  it('is null when there is nothing to flag', () => {
    expect(includesLine([], 100)).toBeNull();
    expect(includesLine([], null)).toBeNull();
  });
});

describe('loggedName', () => {
  it('appends switched-on tweaks', () => {
    expect(loggedName('Wrap', [{ label: 'No cheese' }, { label: 'Sauce on side' }])).toBe('Wrap (no cheese, sauce on side)');
  });
  it('leaves the name alone with none', () => {
    expect(loggedName('Wrap', [])).toBe('Wrap');
  });
});

describe('cropRect', () => {
  it('pads the box a little and normalises to 0-1', () => {
    expect(cropRect([400, 100, 450, 700])).toEqual({ x: 0.06, y: 0.36, w: 0.68, h: 0.13 });
  });
  it('clamps at the photo edges', () => {
    const r = cropRect([0, 0, 1000, 1000]);
    expect(r).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});
