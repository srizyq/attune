// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const db = vi.hoisted(() => ({ getFoodLogsForRange: vi.fn() }));
vi.mock('../../lib/db', () => db);
import PlanVsActualCard from './PlanVsActualCard';

// Pin "today" to a Wednesday so the plan's Monday/Tuesday are past days.
const TODAY = '2026-10-14';
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-14T03:00:00Z')); db.getFoodLogsForRange.mockResolvedValue([]); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

const item = (name, calories) => ({ name, calories, protein_g: 10, carbs_g: 0, fat_g: 0 });
const plan = { id: 'p', days: { mon: { breakfast: [item('Oats', 300)], dinner: [item('Salmon', 600)] }, tue: { lunch: [item('Chicken salad', 500)] } } };
const client = { id: 'c1', name: 'Maya' };
const log = (date, meal, food_name, calories, source) => ({ logged_date: date, meal, food_name, calories, protein_g: 5, source });

describe('PlanVsActualCard', () => {
  it('asks for the last 7 days of the client\'s log, and summarises how they followed the plan', async () => {
    db.getFoodLogsForRange.mockResolvedValue([log('2026-10-12', 'breakfast', 'Oats', 300, 'plan'), log('2026-10-12', 'dinner', 'Pizza', 900, null)]);
    render(<PlanVsActualCard client={client} plan={plan} />);
    expect(await screen.findByTestId('plan-summary')).toHaveTextContent('1 of 3 planned meals logged from the plan');
    expect(db.getFoodLogsForRange).toHaveBeenCalledWith('c1', '2026-10-08', TODAY);
    expect(screen.getByText(/1 ate something else · 1 not logged/)).toBeInTheDocument();
  });

  it('shows each planned meal as from the plan, something else, or nothing', async () => {
    db.getFoodLogsForRange.mockResolvedValue([log('2026-10-12', 'breakfast', 'Oats', 300, 'plan'), log('2026-10-12', 'dinner', 'Pizza', 900, null)]);
    render(<PlanVsActualCard client={client} plan={plan} />);
    expect(await screen.findByLabelText('Monday Breakfast: logged from the plan')).toBeInTheDocument();
    expect(screen.getByLabelText('Monday Dinner: ate something else')).toBeInTheDocument();
    expect(screen.getByLabelText('Tuesday Lunch: nothing logged')).toBeInTheDocument();
    expect(screen.getByText(/Plan 900 kcal · ate 1,200 kcal/)).toBeInTheDocument();
  });

  it('renders nothing without a plan, or with an empty one — and does not even fetch', () => {
    expect(render(<PlanVsActualCard client={client} plan={null} />).container).toBeEmptyDOMElement();
    expect(render(<PlanVsActualCard client={client} plan={{ id: 'p', days: {} }} />).container).toBeEmptyDOMElement();
    expect(db.getFoodLogsForRange).not.toHaveBeenCalled();
  });

  it('says so when the log cannot be loaded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    db.getFoodLogsForRange.mockRejectedValue(new Error('down'));
    render(<PlanVsActualCard client={client} plan={plan} />);
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load their food log");
  });
});
