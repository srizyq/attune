// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const state = {};
const navigate = vi.fn();
vi.mock('../hooks/useMealPlans', () => ({ useMyMealPlans: () => state.hook }));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
import TodayPlanStrip from './TodayPlanStrip';

const plan = (over = {}) => ({ id: 'p1', name: 'Cut phase', days: { mon: { breakfast: [{ name: 'Oats', calories: 220 }], dinner: [{ name: 'Fish', calories: 500 }] } }, ...over });
const setup = (plans, date = '2026-09-21', supported = true) => { state.hook = { supported, plans }; render(<TodayPlanStrip date={date} />); };
afterEach(() => { cleanup(); navigate.mockClear(); });

describe('TodayPlanStrip', () => {
  it('summarises the planned day and opens the plan', async () => {
    setup([plan()]);
    expect(screen.getByText('Cut phase: 720 kcal planned')).toBeInTheDocument();
    expect(screen.getByText('Breakfast · Dinner')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open Cut phase' }));
    expect(navigate).toHaveBeenCalledWith('/coach');
  });

  it('follows the day being viewed, not just today', () => {
    setup([plan()], '2026-09-22'); // Tuesday — nothing planned
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing with no plans, an unsupported database, or a bad date', () => {
    setup([]);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    cleanup();
    setup([plan()], '2026-09-21', false);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    cleanup();
    setup([plan()], 'not-a-date');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('skips a plan with nothing on that day and uses the next that has something', () => {
    setup([plan({ id: 'a', name: 'Empty', days: {} }), plan({ id: 'b', name: 'Real' })]);
    expect(screen.getByText('Real: 720 kcal planned')).toBeInTheDocument();
  });
});
