import { describe, it, expect } from 'vitest';
import {
  percentOf, energySplit, nutritionRows, macroNotes, dietaryBadges, nutriScoreInfo,
  dayFit, productInsight, plateInsight,
} from './scanInsights';

const TARGETS = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70 };

describe('percentOf', () => {
  it('rounds and guards against a missing target', () => {
    expect(percentOf(140, 2000)).toBe(7);
    expect(percentOf(50, 0)).toBeNull();
    expect(percentOf(50, undefined)).toBeNull();
    expect(percentOf(-5, 100)).toBe(0);
  });
});

describe('energySplit', () => {
  it('splits calories by macro and always totals 100', () => {
    const s = energySplit({ protein: 25, carbs: 8, fat: 1.5 });
    expect(s.protein + s.carbs + s.fat).toBe(100);
    expect(s.protein).toBeGreaterThan(s.carbs);
  });
  it('is null with no macro energy', () => {
    expect(energySplit({ protein: 0, carbs: 0, fat: 0 })).toBeNull();
  });
  it('still totals 100 on awkward thirds', () => {
    const s = energySplit({ protein: 10, carbs: 10, fat: 4.44 });
    expect(s.protein + s.carbs + s.fat).toBe(100);
  });
});

describe('nutritionRows', () => {
  it('always shows fibre, sugar and sodium, and only other nutrients that have a value', () => {
    const rows = nutritionRows({ sodium: 45, fibre: 0, sugar: 3, calcium: 260, cholesterol: 0 });
    expect(rows.map(r => r.key)).toEqual(['sodium', 'fibre', 'sugar', 'calcium']);
    expect(rows.find(r => r.key === 'sodium').dv).toBe(2);
    expect(rows.find(r => r.key === 'calcium').dv).toBe(20);
  });
  it('notes added sugars under total sugars', () => {
    const rows = nutritionRows({ sugar: 9, addedSugar: 4 });
    expect(rows.find(r => r.key === 'sugar').sub).toBe('Includes 4g added sugars');
  });
});

describe('macroNotes', () => {
  it('describes each macro only when there is something to say', () => {
    expect(macroNotes({ protein: 25, sugar: 3, fat: 1.5 })).toEqual({ protein: 'High', carbs: '3g sugar', fat: 'Low fat' });
    expect(macroNotes({ protein: 8, sugar: 0, fat: 10 })).toEqual({ protein: null, carbs: null, fat: null });
  });
});

describe('dietaryBadges', () => {
  it('maps known Open Food Facts tags and ignores unknown ones', () => {
    const b = dietaryBadges({ labels: ['en:gluten-free', 'en:something-odd', 'en:no-sugar-added', 'en:no-added-sugar'] });
    expect(b).toEqual(['Gluten-free', 'No added sugar']);
  });
  it('adds numbers-based badges', () => {
    const b = dietaryBadges({ food: { cal: 140, protein: 25, fibre: 0, sugar: 3 } });
    expect(b).toEqual(['High protein', 'Low sugar']);
  });
  it('is empty with nothing to say', () => {
    expect(dietaryBadges({ food: { cal: 200, protein: 2, fibre: 1, sugar: 0 } })).toEqual([]);
  });
});

describe('nutriScoreInfo', () => {
  it('upper-cases a known grade and rejects others', () => {
    expect(nutriScoreInfo('a').grade).toBe('A');
    expect(nutriScoreInfo('unknown')).toBeNull();
    expect(nutriScoreInfo(null)).toBeNull();
  });
});

describe('dayFit / productInsight', () => {
  it('is null without a calorie target', () => {
    expect(dayFit({ cal: 100 }, { calories: 0 })).toBeNull();
    expect(productInsight({ cal: 100, protein: 5 }, { calories: 0 }, {})).toBeNull();
  });
  it('talks about protein and calories when it fits', () => {
    const i = productInsight({ cal: 140, protein: 25 }, TARGETS, { cal: 500, protein: 30 });
    expect(i.text).toBe('Fulfils 17% of your daily protein target while using 7% of your daily calories.');
    expect(i.tag).toBe('High value');
  });
  it('warns when it is more than what is left', () => {
    const i = productInsight({ cal: 600, protein: 5 }, TARGETS, { cal: 1700, protein: 0 });
    expect(i.tag).toBe('Over budget');
    expect(i.text).toContain('300 kcal are left');
  });
  it('handles a day that is already over target', () => {
    const i = productInsight({ cal: 100, protein: 5 }, TARGETS, { cal: 2100, protein: 0 });
    expect(i.text).toContain("already reached");
  });
  it('falls back to calories when protein is negligible', () => {
    const i = productInsight({ cal: 100, protein: 1 }, TARGETS, { cal: 0, protein: 0 });
    expect(i.text).toBe('Uses 5% of your daily calories and leaves you 1900 kcal for the rest of the day.');
  });
});

describe('plateInsight', () => {
  it('uses the protein still remaining today', () => {
    const i = plateInsight({ cal: 529, protein: 48 }, TARGETS, { cal: 0, protein: 70 });
    expect(i.text).toBe('Delivers 60% of your remaining protein target for 26% of your daily calories.');
  });
  it('falls back to calories once protein is met', () => {
    const i = plateInsight({ cal: 500, protein: 40 }, TARGETS, { cal: 0, protein: 200 });
    expect(i.text).toContain('Uses 25% of your daily calories');
  });
});

describe('menu helpers', () => {
  it('flags high protein and low carb dishes', async () => {
    const { isHighProtein, isLowCarb, dishLabel } = await import('./scanInsights');
    expect(isHighProtein({ cal: 500, protein: 40 })).toBe(true);
    expect(isHighProtein({ cal: 200, protein: 16 })).toBe(true); // 64 of 200 kcal
    expect(isHighProtein({ cal: 900, protein: 18 })).toBe(false);
    expect(isLowCarb({ cal: 400, carbs: 12 })).toBe(true);
    expect(isLowCarb({ cal: 0, carbs: 0 })).toBe(false);
    expect(dishLabel({ cal: 410, protein: 44, carbs: 18 })).toBe('High protein');
    expect(dishLabel({ cal: 600, protein: 10, carbs: 15 })).toBe('Low carb');
    expect(dishLabel({ cal: 350, protein: 8, carbs: 40 })).toBe('Light');
    expect(dishLabel({ cal: 900, protein: 8, carbs: 90 })).toBeNull();
  });
  it('writes the dining advice from what is left today', async () => {
    const { menuAdvice } = await import('./scanInsights');
    const pick = { name: 'Pan-Seared Scallops', cal: 410, protein: 44 };
    expect(menuAdvice(pick, TARGETS, { cal: 1000, protein: 100 }))
      .toBe('Based on your remaining 1000 kcal and 50g protein, Pan-Seared Scallops (410 kcal, 44g protein) fits best without going over budget.');
    expect(menuAdvice(pick, TARGETS, { cal: 1800, protein: 0 })).toContain('more than the 200 kcal you have left');
    expect(menuAdvice(pick, { calories: 0 }, {})).toBeNull();
    expect(menuAdvice(null, TARGETS, {})).toBeNull();
  });
});
