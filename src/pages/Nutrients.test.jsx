// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), useLocation: () => ({ state: null }) }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => h.profile }));
vi.mock('../hooks/useFoodLogs', () => ({ useFoodLogs: () => h.logs }));
vi.mock('../hooks/useFoodLogsRange', () => ({ useFoodLogsRange: (end, days, enabled) => (enabled ? h.range : { items: [], dates: [], loading: false }) }));
vi.mock('../components/AppNav', () => ({ default: () => <nav /> }));
import Nutrients from './Nutrients';

const row = (over) => ({ id: 'r', calories: 100, protein_g: 5, carbs_g: 10, fat_g: 2, ...over });
const setup = ({ premium = true, meals, logs, profile = {} }) => {
  h.profile = { profile: { is_premium: premium, calorie_target: 2000, micro_targets: {}, ...profile } };
  h.logs = { loading: false, logs, meals };
  render(<Nutrients />);
};
const empty = { breakfast: [], lunch: [], dinner: [], snacks: [] };
afterEach(cleanup);

describe('Nutrients — extended sections', () => {
  it('sums only foods that carry a nutrient and says how many did', () => {
    const meals = { ...empty, lunch: [{ name: 'Salmon', thiamin: 0.2, caffeine: 0 }, { name: 'Tea', thiamin: 0.3, caffeine: 40 }, { name: 'Mystery', thiamin: null, caffeine: null }] };
    setup({ meals, logs: [row(), row(), row()] });
    expect(screen.getAllByText(/Based on 2 of 3 foods logged/).length).toBe(3);
    // MicroCard wraps its header row (icon+label+% badge) and its value row
    // as siblings inside the shared Card component — closest('div') only
    // reaches the header row, so one more parentElement is needed to land
    // on Card's own root, which contains both.
    const card = screen.getByText('Thiamin (B1)').closest('div').parentElement.parentElement;
    expect(within(card).getByText('0.5')).toBeInTheDocument();
    const caf = screen.getByText('Caffeine').closest('div').parentElement.parentElement;
    expect(within(caf).getByText('40')).toBeInTheDocument();
  });

  it('is honest when nothing logged carries them', () => {
    setup({ meals: { ...empty, lunch: [{ name: 'Toast', thiamin: null }] }, logs: [row()] });
    expect(screen.getAllByText(/None of the foods logged carry these/).length).toBe(3);
  });

  it('shows the PRO badge (and locks the cards) for free users', () => {
    setup({ premium: false, meals: { ...empty, lunch: [{ name: 'Toast' }] }, logs: [row()] });
    expect(screen.getByText('B vitamins, vitamin E & K').parentElement).toHaveTextContent('PRO');
  });

  it('adds no extended note on an empty day', () => {
    setup({ meals: empty, logs: [] });
    expect(screen.queryByText(/foods logged/)).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing logged today yet/)).toBeInTheDocument();
  });
});

describe('Nutrients — rest-day targets', () => {
  // Pinned to Wednesday 23 Sep 2026 (local), so which days are training days is
  // the same whatever day the tests run; the page opens on "today".
  const dow = 3;
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 23, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());
  const day = { calorie_target: 2500, protein_g: 180, rest_day_targets: { calories: 1800, protein_g: 150 } };

  it('shows the everyday target on a training day', () => {
    setup({ meals: empty, logs: [], profile: { ...day, training_days: [dow] } });
    expect(screen.getByText(/\/ 2,500 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 180g/)).toBeInTheDocument();
  });

  it('shows the rest-day target on a rest day', () => {
    setup({ meals: empty, logs: [], profile: { ...day, training_days: [(dow + 1) % 7] } });
    expect(screen.getByText(/\/ 1,800 kcal/)).toBeInTheDocument();
    expect(screen.getByText(/\/ 150g/)).toBeInTheDocument();
    expect(screen.queryByText(/2,500/)).not.toBeInTheDocument();
  });

  it('is unchanged for someone not using rest-day targets', () => {
    setup({ meals: empty, logs: [], profile: { calorie_target: 2500 } });
    expect(screen.getByText(/\/ 2,500 kcal/)).toBeInTheDocument();
  });
});

describe('Nutrients — averages, goals and personal targets', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 8, 23, 12, 0, 0)); });
  afterEach(() => vi.useRealTimers());
  const item = (loggedDate, over) => ({ id: `${loggedDate}-${over.name}`, loggedDate, cal: 500, protein: 30, carbs: 50, fat: 10, calcium: 0, ...over });

  it('averages over the days that have something logged, not all seven', async () => {
    h.range = {
      loading: false,
      dates: ['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'],
      items: [item('2026-09-22', { name: 'Yoghurt', calcium: 300 }), item('2026-09-23', { name: 'Cheese', calcium: 500 })],
    };
    setup({ meals: empty, logs: [], profile: { sex: 'male', date_of_birth: '1990-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: '7-day avg' }));
    expect(await screen.findByText(/Daily average over the 2 of 7 days you logged/)).toBeInTheDocument();
    const card = screen.getByText('Calcium').closest('div').parentElement.parentElement;
    expect(within(card).getByText('400')).toBeInTheDocument(); // (300 + 500) / 2 days
    expect(within(card).getByText(/Average of 2 logged days/)).toBeInTheDocument();
    expect(screen.getByText('Daily average calories')).toBeInTheDocument();
  });

  it('groups by health goal with a one-line summary', () => {
    setup({ meals: { ...empty, lunch: [{ id: 'a', name: 'Milk', loggedDate: '2026-09-23', cal: 100, calcium: 900 }] }, logs: [row()], profile: { sex: 'male', date_of_birth: '1990-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'By goal' }));
    const bones = screen.getByTestId('goal-bones');
    expect(within(bones).getByText('Bone health')).toBeInTheDocument();
    expect(within(bones).getByText(/of \d+ at 70%\+ of target/)).toBeInTheDocument();
    expect(within(bones).getByText('Calcium')).toBeInTheDocument();
    expect(screen.getByTestId('goal-heart')).toBeInTheDocument();
  });

  it('uses the recommendation for the person\'s age and sex rather than one general figure', () => {
    setup({ meals: empty, logs: [], profile: { sex: 'female', date_of_birth: '1995-05-05' } });
    expect(screen.getByText('Recommended for you: 18mg/day')).toBeInTheDocument(); // iron, women 19-50
    cleanup();
    setup({ meals: empty, logs: [], profile: { sex: 'male', date_of_birth: '1995-05-05' } });
    expect(screen.getByText('Recommended for you: 8mg/day')).toBeInTheDocument(); // iron, men
  });
});
