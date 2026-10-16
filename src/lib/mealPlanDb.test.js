import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({ writes: [], results: [] }));
vi.mock('./supabase', () => ({
  supabase: { from: () => ({ upsert: (row) => { h.writes.push(row); return { select: () => ({ single: () => Promise.resolve(h.results.shift() ?? { data: { id: 'p' }, error: null }) }) }; } }) },
}));
import { saveMealPlan, stripFoodLinks } from './db';

beforeEach(() => { h.writes.length = 0; h.results.length = 0; });
const linked = { name: 'Chicken', label: '150g', calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4, grams: 150, src: 'AUSNUT', per100: { calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6 } };
const days = { mon: { lunch: [linked, { name: 'Oats', calories: 220 }] } };
const fields = { name: 'Plan', notes: '', days, isActive: true };

describe('stripFoodLinks', () => {
  it('removes the link fields and keeps the numbers the client reads', () => {
    expect(stripFoodLinks(days)).toEqual({ mon: { lunch: [{ name: 'Chicken', label: '150g', calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 }, { name: 'Oats', calories: 220 }] } });
    expect(stripFoodLinks(null)).toEqual({});
  });
});

describe('saveMealPlan', () => {
  it('saves the plan with its food links', async () => {
    await saveMealPlan('t', 'c', fields);
    expect(h.writes).toHaveLength(1);
    expect(h.writes[0].days.mon.lunch[0].per100).toBeTruthy();
  });

  it('saves again without the links when the database has not had the update, so the coach is not blocked', async () => {
    h.results.push({ data: null, error: { code: '23514', message: 'violates check constraint "meal_plans_days_check"' } });
    await expect(saveMealPlan('t', 'c', fields)).resolves.toEqual({ id: 'p' });
    expect(h.writes).toHaveLength(2);
    expect(h.writes[1].days.mon.lunch[0]).not.toHaveProperty('per100');
    expect(h.writes[1].days.mon.lunch[0].calories).toBe(248);
  });

  it('does not retry a plan with no links (the constraint failed for a real reason), or any other error', async () => {
    h.results.push({ data: null, error: { code: '23514', message: 'bad plan' } });
    await expect(saveMealPlan('t', 'c', { ...fields, days: { mon: { lunch: [{ name: 'Oats', calories: 220 }] } } })).rejects.toMatchObject({ code: '23514' });
    expect(h.writes).toHaveLength(1);
    h.writes.length = 0;
    h.results.push({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(saveMealPlan('t', 'c', fields)).rejects.toMatchObject({ code: '42501' });
    expect(h.writes).toHaveLength(1);
  });
});
