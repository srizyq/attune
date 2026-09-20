// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const db = vi.hoisted(() => ({ getSavedMeals: vi.fn() }));
vi.mock('../../lib/db', () => db);
import MealPlanEditor from './MealPlanEditor';

const clientData = { name: 'Sam' };
const setup = (admin = {}) => {
  const a = { supported: true, plan: null, loading: false, save: vi.fn().mockResolvedValue({}), remove: vi.fn().mockResolvedValue(undefined), ...admin };
  render(<MealPlanEditor trainerId="t1" clientData={clientData} admin={a} />);
  return a;
};
const existing = { id: 'p1', name: 'Cut phase', notes: 'Hydrate', is_active: true, days: { mon: { breakfast: [{ name: 'Oats', label: '60g', calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4 }] } } };
const fillFirstBreakfast = async (name, kcal) => {
  await userEvent.click(within(screen.getByText('Breakfast').parentElement.parentElement).getByRole('button', { name: '+ Add item' }));
  await userEvent.type(screen.getByLabelText('Breakfast item 1 name'), name);
  if (kcal) await userEvent.type(screen.getByLabelText('Breakfast item 1 calories'), String(kcal));
};

beforeEach(() => { db.getSavedMeals.mockResolvedValue([]); vi.stubGlobal('confirm', vi.fn(() => true)); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('MealPlanEditor', () => {
  it('explains the missing database update instead of breaking', () => {
    setup({ supported: false });
    expect(screen.getByText(/need the latest database update/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /plan/i })).not.toBeInTheDocument();
  });

  it('builds a plan and saves it cleaned: trimmed, numeric, no editor-only keys', async () => {
    const a = setup();
    await fillFirstBreakfast('  Oats  ', 220);
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(a.save).toHaveBeenCalledTimes(1);
    const arg = a.save.mock.calls[0][0];
    expect(arg).toEqual({ name: 'Meal plan', notes: '', isActive: true, days: { mon: { breakfast: [{ name: 'Oats', calories: 220, protein_g: 0, carbs_g: 0, fat_g: 0 }] } } });
    expect(JSON.stringify(arg)).not.toContain('_k');
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });

  it('will not save an unnamed item, and says where', async () => {
    const a = setup();
    await userEvent.click(within(screen.getByText('Lunch').parentElement.parentElement).getByRole('button', { name: '+ Add item' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Monday Lunch, item 1 needs a name');
    expect(a.save).not.toHaveBeenCalled();
  });

  it('will not save without a plan name', async () => {
    const a = setup();
    await fillFirstBreakfast('Oats');
    await userEvent.clear(screen.getByLabelText('Plan name'));
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Give the plan a name');
    expect(a.save).not.toHaveBeenCalled();
  });

  it('shows a save failure and stays editable', async () => {
    const a = setup({ save: vi.fn().mockRejectedValue(new Error('Plan too big')) });
    await fillFirstBreakfast('Oats');
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Plan too big');
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeEnabled();
    expect(a.save).toHaveBeenCalled();
  });

  it('loads an existing plan, and keeps the client-facing toggle', async () => {
    const a = setup({ plan: existing });
    expect(screen.getByLabelText('Plan name')).toHaveValue('Cut phase');
    expect(screen.getByLabelText('Breakfast item 1 name')).toHaveValue('Oats');
    await userEvent.click(screen.getByLabelText(/Send to Sam/));
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(a.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false, name: 'Cut phase', notes: 'Hydrate' }));
  });

  it('shows the day total and which days have meals', async () => {
    setup({ plan: existing });
    expect(screen.getByText(/Monday total/)).toBeInTheDocument();
    expect(screen.getByText(/220 kcal · P 8g · C 38g · F 4g/)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Mon/ })).toHaveTextContent('•');
    await userEvent.click(screen.getByRole('tab', { name: /Tue/ }));
    expect(screen.queryByLabelText('Breakfast item 1 name')).not.toBeInTheDocument();
    expect(screen.getByText(/0 kcal/)).toBeInTheDocument();
  });

  it('copies a day to others as an independent copy', async () => {
    const a = setup({ plan: existing });
    await userEvent.click(screen.getByText(/Copy Mon to other days/));
    await userEvent.click(screen.getByLabelText('Tue'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await userEvent.click(screen.getByRole('tab', { name: /Tue/ }));
    expect(screen.getByLabelText('Breakfast item 1 name')).toHaveValue('Oats');
    await userEvent.type(screen.getByLabelText('Breakfast item 1 name'), ' EXTRA');
    await userEvent.click(screen.getByRole('tab', { name: /Mon/ }));
    expect(screen.getByLabelText('Breakfast item 1 name')).toHaveValue('Oats'); // Monday untouched
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    const { days } = a.save.mock.calls[0][0];
    expect(days.mon.breakfast[0].name).toBe('Oats');
    expect(days.tue.breakfast[0].name).toBe('Oats EXTRA');
  });

  it('clears a day', async () => {
    const a = setup({ plan: existing });
    await userEvent.click(screen.getByText(/Copy Mon to other days/));
    await userEvent.click(screen.getByRole('button', { name: 'Clear Mon' }));
    expect(screen.queryByLabelText('Breakfast item 1 name')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(a.save.mock.calls[0][0].days).toEqual({});
  });

  it('adds a recipe from the coach’s own list as one serving', async () => {
    db.getSavedMeals.mockResolvedValue([{ id: 'r1', name: 'Chilli', servings: 2, items: [{ name: 'Beans', cal: 400, protein: 20, carbs: 60, fat: 6 }] }]);
    const a = setup();
    const select = await screen.findByLabelText('Add a recipe to Dinner');
    await userEvent.selectOptions(select, 'r1');
    expect(screen.getByLabelText('Dinner item 1 name')).toHaveValue('Chilli');
    expect(screen.getByLabelText('Dinner item 1 portion')).toHaveValue('1 serving');
    expect(screen.getByLabelText('Dinner item 1 calories')).toHaveValue(200);
    await userEvent.click(screen.getByRole('button', { name: 'Create plan' }));
    expect(a.save.mock.calls[0][0].days.mon.dinner[0]).toMatchObject({ name: 'Chilli', label: '1 serving', calories: 200 });
  });

  it('survives the recipes failing to load', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getSavedMeals.mockRejectedValue(new Error('offline'));
    setup();
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.queryByLabelText(/Add a recipe/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create plan' })).toBeInTheDocument();
    spy.mockRestore();
  });

  it('lists the grocery needs across the week and copies them', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup({ plan: { ...existing, days: { mon: existing.days.mon, wed: existing.days.mon } } });
    await userEvent.click(screen.getByRole('button', { name: /Grocery list \(1\)/ }));
    expect(screen.getByText('Oats (60g) ×2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy list' }));
    expect(writeText).toHaveBeenCalledWith('• Oats (60g) ×2');
  });

  it('removes the plan only after confirming, and shows a failure', async () => {
    const a = setup({ plan: existing, remove: vi.fn().mockRejectedValue(new Error('nope')) });
    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Remove plan' }));
    expect(a.remove).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Remove plan' }));
    expect(a.remove).toHaveBeenCalledWith('p1');
    expect(await screen.findByRole('alert')).toHaveTextContent('nope');
  });

  it('stops adding items at the limit', async () => {
    setup({ plan: { ...existing, days: { mon: { breakfast: Array.from({ length: 20 }, (_, i) => ({ name: `F${i}`, calories: 1 })) } } } });
    expect(screen.getAllByRole('button', { name: '+ Add item' })[0]).toBeDisabled();
  });

  it('resets when the client changes (new plan object)', async () => {
    const admin = { supported: true, plan: existing, loading: false, save: vi.fn(), remove: vi.fn() };
    const { rerender } = render(<MealPlanEditor trainerId="t1" clientData={clientData} admin={admin} />);
    await userEvent.type(screen.getByLabelText('Plan name'), ' edited');
    rerender(<MealPlanEditor trainerId="t1" clientData={{ name: 'Alex' }} admin={{ ...admin, plan: null }} />);
    expect(screen.getByLabelText('Plan name')).toHaveValue('Meal plan');
    expect(screen.queryByLabelText('Breakfast item 1 name')).not.toBeInTheDocument();
  });
});
