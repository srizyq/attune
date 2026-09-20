// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useMealPlans', () => ({ useMyMealPlans: () => state.plansHook }));
vi.mock('../hooks/useFoodLogs', () => ({ useFoodLogs: (date) => { state.date = date; return state.logsHook; } }));
import MealPlanCard from './MealPlanCard';

const it1 = (over) => ({ name: 'Oats', label: '60g', calories: 220, protein_g: 8, carbs_g: 38, fat_g: 4, ...over });
const plan = (over = {}) => ({
  id: 'p1', name: 'Cut phase', notes: 'Drink water.', trainer: { name: 'Jordan Lee' },
  days: {
    mon: { breakfast: [it1(), it1({ name: 'Banana', label: '1 medium', calories: 100 })], lunch: [it1({ name: 'Chicken salad', label: '', calories: 450 })] },
    tue: { breakfast: [it1()] },
  },
  ...over,
});
const setup = (plans, { logged = [], addFood, refetch, supported = true } = {}) => {
  state.plansHook = { supported, plans, loading: false };
  state.logsHook = {
    meals: { breakfast: logged.filter((l) => l.meal === 'breakfast'), lunch: logged.filter((l) => l.meal === 'lunch'), dinner: [], snacks: [] },
    addFood: addFood || vi.fn().mockResolvedValue({}),
    refetch: refetch || vi.fn().mockResolvedValue(undefined),
  };
  render(<MealPlanCard />);
  return state.logsHook;
};

// Monday 21 Sep 2026, local time — so "today" is a planned day whatever the machine's timezone.
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 21, 12, 0, 0)); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('MealPlanCard', () => {
  it('renders nothing without a plan, or before the database update', () => {
    setup([]);
    expect(screen.queryByText('Cut phase')).not.toBeInTheDocument();
    cleanup();
    setup([plan()], { supported: false });
    expect(screen.queryByText('Cut phase')).not.toBeInTheDocument();
  });

  it("shows today's meals from the coach, with today's date driving the log", () => {
    setup([plan()]);
    expect(state.date).toBe('2026-09-21');
    expect(screen.getByText(/From Jordan Lee\. Drink water\./)).toBeInTheDocument();
    expect(screen.getByText('Oats')).toBeInTheDocument();
    expect(screen.getByText('Chicken salad')).toBeInTheDocument();
    expect(screen.getByText(/Today’s plan: 770 kcal/)).toBeInTheDocument(); // 220 + 100 + 450
  });

  it('logs every item of a meal in one tap, tagged as from the plan, then refreshes', async () => {
    const h = setup([plan()]);
    await userEvent.click(screen.getByRole('button', { name: 'Log Breakfast' }));
    expect(h.addFood).toHaveBeenCalledTimes(2);
    expect(h.addFood).toHaveBeenNthCalledWith(1, expect.objectContaining({ name: 'Oats', cal: 220, protein: 8, servingLabel: '60g', source: 'plan' }), 'breakfast', null);
    expect(h.addFood).toHaveBeenNthCalledWith(2, expect.objectContaining({ name: 'Banana', cal: 100 }), 'breakfast', null);
    expect(h.refetch).toHaveBeenCalled();
  });

  it('shows a meal already logged from the plan as done, and will not log it twice', async () => {
    const h = setup([plan()], { logged: [{ meal: 'breakfast', name: 'Oats', source: 'plan' }, { meal: 'breakfast', name: 'Banana', source: 'plan' }] });
    const done = screen.getByRole('button', { name: 'Breakfast logged' });
    expect(done).toBeDisabled();
    await userEvent.click(done);
    expect(h.addFood).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Log Lunch' })).toBeEnabled();
  });

  it('does not count something the client typed in themselves as the planned meal', () => {
    setup([plan()], { logged: [{ meal: 'breakfast', name: 'Oats', source: 'custom' }] });
    expect(screen.getByRole('button', { name: 'Log Breakfast' })).toBeEnabled();
  });

  it('a partly logged meal is not done, and a failed log says so and re-syncs', async () => {
    const addFood = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Network down'));
    const h = setup([plan()], { addFood });
    await userEvent.click(screen.getByRole('button', { name: 'Log Breakfast' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(h.refetch).toHaveBeenCalled(); // so what did go in is reflected, and a retry won't double it
    expect(screen.getByRole('button', { name: 'Log Breakfast' })).toBeEnabled();
  });

  it('says so when nothing is planned for today', async () => {
    vi.setSystemTime(new Date(2026, 8, 23, 12, 0, 0)); // Wednesday
    setup([plan()]);
    expect(screen.getByText(/Nothing planned for today/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Log / })).not.toBeInTheDocument();
  });

  it('shows the whole week, without log buttons, with today open', async () => {
    setup([plan()]);
    await userEvent.click(screen.getByRole('tab', { name: 'Week' }));
    expect(screen.getByText(/Monday \(today\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tuesday/)).toBeInTheDocument();
    expect(screen.getAllByText(/rest \/ free/)).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /^Log / })).not.toBeInTheDocument();
  });

  it('builds a grocery list across the week, counting repeats, and copies it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    setup([plan()]);
    await userEvent.click(screen.getByRole('tab', { name: 'Grocery list' }));
    const list = screen.getByRole('list');
    expect(within(list).getByText('Oats (60g) ×2')).toBeInTheDocument(); // Mon + Tue
    expect(within(list).getByText('Chicken salad')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy list' }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('• Oats (60g) ×2'));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });

  it('shows a card per coach when several have set plans', () => {
    setup([plan(), plan({ id: 'p2', name: 'Bulk phase', trainer: { name: 'Sam Ray' } })]);
    expect(screen.getByText('Cut phase')).toBeInTheDocument();
    expect(screen.getByText('Bulk phase')).toBeInTheDocument();
  });

  it('falls back to a generic coach name when the coach has none', () => {
    setup([plan({ trainer: null, notes: '' })]);
    expect(screen.getByText('From Your coach.')).toBeInTheDocument();
  });
});
