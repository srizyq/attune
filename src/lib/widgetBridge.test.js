import { describe, it, expect } from 'vitest';
import { buildSnapshot } from './widgetBridge.js';

describe('buildSnapshot', () => {
  it('computes what is left, never negative', () => {
    const s = buildSnapshot({ calorieTarget: 2000, consumed: 2300.4, protein: 50, carbs: 100, fat: 20, targets: { protein: 150, carbs: 200, fat: 60 } });
    expect(s).toMatchObject({ caloriesLeft: 0, calorieGoal: 2000, proteinLeft: 100, carbsLeft: 100, fatLeft: 40 });
  });
  it('reports a running fast', () => {
    const s = buildSnapshot({ fast: { started_at: '2026-11-10T00:00:00Z', target_hours: 18, ended_at: null } });
    expect(s.fastStart).toBe(Date.parse('2026-11-10T00:00:00Z') / 1000);
    expect(s.fastTargetHours).toBe(18);
  });
  it('is all zeros with nothing', () => {
    expect(buildSnapshot({})).toMatchObject({ caloriesLeft: 0, fastStart: 0 });
  });
});
