import { describe, it, expect } from 'vitest';
import { DIET_STYLES, FAT_PCT_RANGE, PROTEIN_PCT_RANGE, dietStyleFor, splitForStyle, netCarbs, carbsToShow, carbsLabel } from './dietStyles';
import { goalMacroSplits, buildTargets } from './calorieTargets';

describe('presets', () => {
  it('every preset is reachable on the sliders and leaves carbs non-negative', () => {
    for (const s of DIET_STYLES.filter((x) => x.split)) {
      expect(s.split.protein).toBeGreaterThanOrEqual(PROTEIN_PCT_RANGE.min);
      expect(s.split.protein).toBeLessThanOrEqual(PROTEIN_PCT_RANGE.max);
      expect(s.split.fat).toBeGreaterThanOrEqual(FAT_PCT_RANGE.min);
      expect(s.split.fat).toBeLessThanOrEqual(FAT_PCT_RANGE.max);
      expect(100 - s.split.protein - s.split.fat).toBeGreaterThanOrEqual(0);
    }
  });
  it('keto leaves 5% for carbs and low carb 25%', () => {
    const keto = DIET_STYLES.find((s) => s.id === 'keto').split;
    const low = DIET_STYLES.find((s) => s.id === 'low-carb').split;
    expect(100 - keto.protein - keto.fat).toBe(5);
    expect(100 - low.protein - low.fat).toBe(25);
  });
  it('keto at 2,000 kcal is 25 g of carbs', () => {
    const k = DIET_STYLES.find((s) => s.id === 'keto').split;
    const t = buildTargets(2000, { protein: k.protein / 100, fat: k.fat / 100, carbs: (100 - k.protein - k.fat) / 100 });
    expect(t.carbs.g).toBe(25);
    expect(t.fat.g).toBe(156);
  });
  it('only keto switches net carbs on with it', () => {
    expect(DIET_STYLES.filter((s) => s.netCarbs).map((s) => s.id)).toEqual(['keto']);
  });
});

describe('dietStyleFor / splitForStyle', () => {
  const lose = goalMacroSplits.lose; // 35 / 35 / 30
  it('recognises each preset exactly, balanced for the goal split, otherwise custom', () => {
    expect(dietStyleFor(25, 70, lose)).toBe('keto');
    expect(dietStyleFor(30, 45, lose)).toBe('low-carb');
    expect(dietStyleFor(35, 30, lose)).toBe('balanced');
    expect(dietStyleFor(33, 30, lose)).toBe('custom');
    expect(dietStyleFor(25, 71, lose)).toBe('custom');
  });
  it('balanced is whatever the goal recommends', () => {
    expect(splitForStyle('balanced', goalMacroSplits.build)).toEqual({ protein: 30, fat: 25 });
    expect(splitForStyle('balanced', goalMacroSplits.lose)).toEqual({ protein: 35, fat: 30 });
  });
  it('a preset round-trips through the matcher', () => {
    for (const s of DIET_STYLES.filter((x) => x.split)) {
      const sp = splitForStyle(s.id, lose);
      expect(dietStyleFor(sp.protein, sp.fat, lose)).toBe(s.id);
    }
    expect(splitForStyle('nope', lose)).toBeNull();
  });
  it('a preset that happens to equal the goal split still reads as that preset', () => {
    // low carb on a goal whose own split is 30 / 45 would be indistinguishable; presets win.
    expect(dietStyleFor(30, 45, { protein: 0.3, fat: 0.45, carbs: 0.25 })).toBe('low-carb');
  });
});

describe('netCarbs', () => {
  it('is carbs minus fibre', () => {
    expect(netCarbs(30, 8)).toBe(22);
    expect(netCarbs('30', '8')).toBe(22);
  });
  it('never goes negative, and ignores more fibre than carbs', () => {
    expect(netCarbs(5, 9)).toBe(0);
    expect(netCarbs(0, 3)).toBe(0);
  });
  it('treats missing values as zero', () => {
    expect(netCarbs(20, null)).toBe(20);
    expect(netCarbs(undefined, 4)).toBe(0);
    expect(netCarbs(null, null)).toBe(0);
  });
});

describe('carbsToShow / carbsLabel', () => {
  it('only subtracts fibre when net carbs is on', () => {
    expect(carbsToShow(30, 8, false)).toBe(30);
    expect(carbsToShow(30, 8, true)).toBe(22);
    expect(carbsToShow(30, 8, undefined)).toBe(30);
  });
  it('relabels', () => {
    expect(carbsLabel(true)).toBe('Net carbs');
    expect(carbsLabel(false)).toBe('Carbs');
  });
});
