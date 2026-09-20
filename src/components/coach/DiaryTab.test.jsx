// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../DaySelector', () => ({ default: () => <div>day-selector</div> }));
vi.mock('../LogItemRow', () => ({ default: ({ item }) => <div>{item.name}</div> }));
vi.mock('./WorkoutsCard', () => ({ default: () => <div>workouts</div> }));
import DiaryTab from './DiaryTab';
import { MICRO_NUTRIENTS } from '../../lib/microNutrients';

const item = (over) => ({ id: 'i', name: 'Salmon', meal: 'lunch', cal: 200, protein: 20, carbs: 0, fat: 12, source: 'ausnut', ...over });
const totals = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, 0]));
const dash = (over = {}) => ({
  meals: { breakfast: [], lunch: [item()], dinner: [], snacks: [] },
  foodLoading: false, checkin: null, microTotals: { ...totals, thiamin: 0.137, selenium: 41.2, calcium: 320 },
  extendedInfo: { withData: 1, of: 1 }, microTargets: {}, hasAnyFood: true, date: '2026-09-21', setDate: vi.fn(), workouts: [], workoutsLoading: false,
  ...over,
});
afterEach(cleanup);

describe('DiaryTab micronutrients', () => {
  it('shows the new nutrient groups with their values, keeping the small ones\' precision', () => {
    render(<DiaryTab d={dash()} />);
    expect(screen.getByText('B vitamins & vitamin E')).toBeInTheDocument();
    expect(screen.getByText('More minerals')).toBeInTheDocument();
    expect(screen.getByText('Omega fats, caffeine & alcohol')).toBeInTheDocument();
    const thiamin = screen.getByText('Thiamin (B1)').closest('div').parentElement;
    expect(within(thiamin).getByText(/0\.14/)).toBeInTheDocument(); // not 0.1
    expect(screen.getAllByText(/Based on 1 of 1 foods logged/).length).toBe(3); // once per extended group
  });

  it('says so when none of the day\'s foods carried the extended nutrients', () => {
    render(<DiaryTab d={dash({ extendedInfo: { withData: 0, of: 3 } })} />);
    expect(screen.getAllByText(/None of the foods logged carry these/).length).toBe(3);
  });

  it('shows no extended note on the established groups, or when nothing was logged', () => {
    render(<DiaryTab d={dash({ hasAnyFood: false, meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, extendedInfo: { withData: 0, of: 0 } })} />);
    expect(screen.getByText('Nothing logged this day.')).toBeInTheDocument();
    expect(screen.queryByText(/foods logged/)).not.toBeInTheDocument();
  });

  it('renders a card for every nutrient — none forgotten when one is added', () => {
    render(<DiaryTab d={dash()} />);
    for (const n of MICRO_NUTRIENTS) expect(screen.getAllByText(n.label).length, n.key).toBeGreaterThan(0);
  });
});
