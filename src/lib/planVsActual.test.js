import { describe, it, expect } from 'vitest';
import { planVsActual } from './planVsActual.js';

// 2026-10-12 is a Monday.
const item = (name, calories, protein_g = 10) => ({ name, calories, protein_g, carbs_g: 0, fat_g: 0 });
const plan = {
  mon: { breakfast: [item('Oats', 300)], lunch: [item('Chicken salad', 500)], dinner: [item('Salmon', 600)] },
  tue: { breakfast: [item('Oats', 300)] },
  // wed..sun: nothing planned
};
const log = (date, meal, food_name, calories, source = null, protein_g = 5) => ({ logged_date: date, meal, food_name, calories, protein_g, source });
const dates = ['2026-10-12', '2026-10-13', '2026-10-14'];
const TODAY = '2026-10-14';

describe('planVsActual', () => {
  it('says, per planned meal, whether it was logged from the plan, something else, or nothing', () => {
    const r = planVsActual(plan, [
      log('2026-10-12', 'breakfast', 'Oats', 300, 'plan'),          // from the plan
      log('2026-10-12', 'lunch', 'Burger', 800, 'fatsecret'),        // something else
      // dinner: nothing
    ], dates, TODAY);
    const mon = r.days[0];
    expect(mon.weekday).toBe('Monday');
    expect(mon.meals.map((m) => [m.meal, m.status])).toEqual([['breakfast', 'plan'], ['lunch', 'other'], ['dinner', 'none']]);
  });

  it('skips weekdays with nothing planned', () => {
    const r = planVsActual(plan, [], dates, TODAY);
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13']); // Wednesday has no plan
  });

  it('compares planned and eaten calories and protein for the day', () => {
    const r = planVsActual(plan, [log('2026-10-12', 'breakfast', 'Oats', 300, 'plan', 12), log('2026-10-12', 'lunch', 'Burger', 800, null, 40)], dates, TODAY);
    expect(r.days[0].planned).toEqual({ calories: 1400, protein_g: 30 });
    expect(r.days[0].actual).toEqual({ calories: 1100, protein_g: 52 });
  });

  it('a meal not yet logged today is pending, not a miss', () => {
    const r = planVsActual({ wed: { breakfast: [item('Oats', 300)], dinner: [item('Salmon', 600)] } }, [log('2026-10-14', 'breakfast', 'Oats', 300, 'plan')], ['2026-10-14'], TODAY);
    expect(r.days[0].meals.map((m) => m.status)).toEqual(['plan', 'pending']);
    expect(r.summary).toEqual({ plannedMeals: 1, fromPlan: 1, somethingElse: 0, skipped: 0, pending: 1 });
  });

  it('summarises across the days, leaving pending meals out of the count', () => {
    const r = planVsActual(plan, [
      log('2026-10-12', 'breakfast', 'Oats', 300, 'plan'), log('2026-10-12', 'lunch', 'Chicken salad', 500, 'plan'), log('2026-10-12', 'dinner', 'Pizza', 900),
      // Tuesday's breakfast: not logged
    ], dates, TODAY);
    expect(r.summary).toEqual({ plannedMeals: 4, fromPlan: 2, somethingElse: 1, skipped: 1, pending: 0 });
  });

  it('only counts a meal as from the plan when everything in it was logged from the plan', () => {
    const p = { mon: { lunch: [item('Rice', 200), item('Chicken', 300)] } };
    const half = planVsActual(p, [log('2026-10-12', 'lunch', 'Rice', 200, 'plan')], ['2026-10-12'], TODAY);
    expect(half.days[0].meals[0].status).toBe('other');
    const full = planVsActual(p, [log('2026-10-12', 'lunch', 'Rice', 200, 'plan'), log('2026-10-12', 'lunch', 'Chicken', 300, 'plan')], ['2026-10-12'], TODAY);
    expect(full.days[0].meals[0].status).toBe('plan');
  });

  it('food logged from the plan in the wrong slot does not count as that meal', () => {
    const r = planVsActual({ mon: { lunch: [item('Rice', 200)] } }, [log('2026-10-12', 'dinner', 'Rice', 200, 'plan')], ['2026-10-12'], TODAY);
    expect(r.days[0].meals[0].status).toBe('none');
  });

  it('handles no plan, no logs and no dates', () => {
    expect(planVsActual(null, [], dates, TODAY).days).toEqual([]);
    expect(planVsActual(plan, null, [], TODAY).days).toEqual([]);
    expect(planVsActual({}, undefined, dates, TODAY).summary).toEqual({ plannedMeals: 0, fromPlan: 0, somethingElse: 0, skipped: 0, pending: 0 });
  });
});
