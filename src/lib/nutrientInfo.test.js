import { describe, it, expect } from 'vitest';
import { NUTRIENT_INFO, HEALTH_GOALS, LIMIT_KEYS } from './nutrientInfo.js';
import { MICRO_KEYS } from './microNutrients.js';

describe('nutrient info', () => {
  it('explains every nutrient and names food sources for it', () => {
    for (const key of MICRO_KEYS) {
      expect(NUTRIENT_INFO[key]?.does?.length, key).toBeGreaterThan(30);
      expect(NUTRIENT_INFO[key].sources.length, key).toBeGreaterThanOrEqual(2);
    }
    expect(Object.keys(NUTRIENT_INFO).sort()).toEqual([...MICRO_KEYS].sort());
  });
  it('health goals only list nutrients that exist, and every nutrient with a target to reach is in some goal', () => {
    const inGoals = new Set(HEALTH_GOALS.flatMap((g) => g.keys));
    for (const g of HEALTH_GOALS) for (const k of g.keys) expect(MICRO_KEYS, `${g.id}/${k}`).toContain(k);
    for (const k of ['calcium', 'iron', 'vitaminC', 'magnesium', 'choline', 'fibre']) expect(inGoals.has(k), k).toBe(true);
    for (const k of LIMIT_KEYS) expect(MICRO_KEYS).toContain(k);
  });
});
