import { describe, it, expect } from 'vitest';
import { weekSummaryTiles } from './weekTiles.js';

const base = { goal: 'lose', pace_kg_per_week: 0.5, calorie_target: 2000, days_logged_7d: 6, days_complete_7d: 4, days_judged_7d: 6, days_on_target_7d: 3, weight_rate_kg_week: -0.45, weigh_ins_28d: 10 };
const by = (tiles, id) => tiles.find((t) => t.id === id);

describe('weekSummaryTiles', () => {
  it('is three tiles: logged, on target, weight', () => {
    expect(weekSummaryTiles(base).map((t) => t.id)).toEqual(['logging', 'target', 'weight']);
    expect(weekSummaryTiles(null)).toBeNull();
  });

  it('logged shows days and how many were complete', () => {
    expect(by(weekSummaryTiles(base), 'logging')).toMatchObject({ value: '6/7', sub: '4 complete days' });
    expect(by(weekSummaryTiles({ ...base, days_complete_7d: 1 }), 'logging').sub).toBe('1 complete day');
  });

  it('on target counts judged days at the shared tolerance, and warns when it is low', () => {
    expect(by(weekSummaryTiles(base), 'target')).toMatchObject({ value: '3/6', sub: 'days within 10%', tone: 'none' });
    expect(by(weekSummaryTiles({ ...base, days_on_target_7d: 1 }), 'target').tone).toBe('fair');
  });

  it('on target says so when nothing could be judged yet, or there is no target', () => {
    expect(by(weekSummaryTiles({ ...base, days_judged_7d: 0, days_on_target_7d: 0 }), 'target')).toMatchObject({ value: '—', sub: 'no full days yet' });
    expect(by(weekSummaryTiles({ ...base, calorie_target: null }), 'target')).toMatchObject({ value: '—', sub: 'no calorie target' });
  });

  it('weight shows the real rate against the plan, in the client\'s unit', () => {
    expect(by(weekSummaryTiles(base), 'weight')).toMatchObject({ value: '−0.45', sub: 'kg/wk · plan −0.5', status: 'on-track' });
    expect(by(weekSummaryTiles(base, { unit: 'lb' }), 'weight')).toMatchObject({ value: '−0.99', sub: 'lb/wk · plan −1.1' });
  });

  it('weight calls out a flat or wrong-way client, in tone as well as words', () => {
    expect(by(weekSummaryTiles({ ...base, weight_rate_kg_week: -0.02 }), 'weight')).toMatchObject({ status: 'stalled', tone: 'fair' });
    expect(by(weekSummaryTiles({ ...base, weight_rate_kg_week: 0.3 }), 'weight')).toMatchObject({ value: '+0.3', status: 'wrong-way', tone: 'low' });
  });

  it('weight says what is missing rather than inventing a number', () => {
    expect(by(weekSummaryTiles({ ...base, weight_rate_kg_week: null }), 'weight')).toMatchObject({ value: '—', sub: 'needs 4+ weigh-ins' });
    expect(by(weekSummaryTiles({ ...base, weight_rate_kg_week: null, goal: null }), 'weight').sub).toBe('no goal set');
  });

  it('works against a database without the newer columns: every logged day counts, no weight rate', () => {
    const old = { calorie_target: 2000, days_logged_7d: 5, days_on_target_7d: 4, goal: 'lose' };
    const t = weekSummaryTiles(old);
    expect(by(t, 'logging')).toMatchObject({ value: '5/7', sub: 'days' });
    expect(by(t, 'target')).toMatchObject({ value: '4/5' });
    expect(by(t, 'weight').value).toBe('—');
  });
});
