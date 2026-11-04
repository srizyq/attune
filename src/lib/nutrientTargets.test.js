import { describe, it, expect } from 'vitest';
import { ageOf, recommendedFor, targetFor, targetsFor, NRV } from './nutrientTargets.js';
import { MICRO_NUTRIENTS } from './microNutrients.js';

const today = new Date(2026, 10, 4);
const woman = { sex: 'female', date_of_birth: '1995-05-05' }; // 31
const man = { sex: 'male', date_of_birth: '1995-05-05' };

describe('ageOf', () => {
  it('works from a date of birth, before and after the birthday', () => {
    expect(ageOf({ date_of_birth: '1995-11-04' }, today)).toBe(31);
    expect(ageOf({ date_of_birth: '1995-11-05' }, today)).toBe(30);
  });
  it('falls back to the stored age, then to unknown', () => {
    expect(ageOf({ age: 42 }, today)).toBe(42);
    expect(ageOf({}, today)).toBeNull();
  });
});

describe('recommendedFor', () => {
  it('differs by sex and age (the NHMRC values)', () => {
    expect(recommendedFor('iron', woman, today)).toBe(18);
    expect(recommendedFor('iron', man, today)).toBe(8);
    expect(recommendedFor('iron', { ...woman, date_of_birth: '1960-01-01' }, today)).toBe(8); // after menopause
    expect(recommendedFor('calcium', { ...woman, date_of_birth: '1960-01-01' }, today)).toBe(1300);
    expect(recommendedFor('vitaminD', { ...man, date_of_birth: '1940-01-01' }, today)).toBe(15);
    expect(recommendedFor('magnesium', man, today)).toBe(420);
  });
  it('raises iron, folate and iodine in pregnancy and lifts vitamin C while breastfeeding', () => {
    expect(recommendedFor('iron', { ...woman, life_stage: 'pregnant' }, today)).toBe(27);
    expect(recommendedFor('folate', { ...woman, life_stage: 'pregnant' }, today)).toBe(600);
    expect(recommendedFor('iodine', { ...woman, life_stage: 'breastfeeding' }, today)).toBe(270);
    expect(recommendedFor('vitaminC', { ...woman, life_stage: 'breastfeeding' }, today)).toBe(85);
  });
  it('ignores a life stage on a profile that is not female', () => {
    expect(recommendedFor('iron', { ...man, life_stage: 'pregnant' }, today)).toBe(8);
  });
  it('uses the midpoint when sex is not given, and nothing when age is unknown or under 9', () => {
    expect(recommendedFor('iron', { sex: 'unspecified', date_of_birth: '1995-05-05' }, today)).toBe(13);
    expect(recommendedFor('iron', { sex: 'male' }, today)).toBeNull();
    expect(recommendedFor('iron', { sex: 'male', age: 6 }, today)).toBeNull();
  });
  it('every row has the right number of bands', () => {
    for (const [key, r] of Object.entries(NRV)) {
      expect(r.m, key).toHaveLength(6);
      expect(r.f, key).toHaveLength(6);
      expect([1, 3], key).toContain(r.preg.length);
      expect([1, 3], key).toContain(r.lact.length);
    }
  });
});

describe('targetFor', () => {
  it('prefers a custom target, then the recommendation, then the general guideline', () => {
    expect(targetFor('iron', { ...woman, micro_targets: { iron: 12 } }, today)).toEqual({ value: 12, source: 'custom' });
    expect(targetFor('iron', woman, today)).toEqual({ value: 18, source: 'personal' });
    expect(targetFor('iron', {}, today)).toEqual({ value: 13, source: 'general' });
    expect(targetFor('transFat', woman, today)).toEqual({ value: null, source: null });
  });
  it('sets saturated fat and added sugar to a tenth of energy, and sodium to 2000mg for adults', () => {
    expect(targetFor('saturatedFat', { ...woman, calorie_target: 2000 }, today).value).toBe(22);
    expect(targetFor('addedSugar', { ...woman, calorie_target: 2000 }, today).value).toBe(50);
    expect(targetFor('sodium', woman, today).value).toBe(2000);
  });
  it('gives a lookup for every tracked nutrient', () => {
    const t = targetsFor(woman, today);
    for (const n of MICRO_NUTRIENTS) expect(n.key in t, n.key).toBe(true);
    expect(t.vitaminK).toBe(60);
  });
});
