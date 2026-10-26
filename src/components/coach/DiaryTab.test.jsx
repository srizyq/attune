// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const openAll = async () => { await userEvent.click(screen.getByRole('button', { name: /Show all/ })); };

describe('DiaryTab nutrients', () => {
  it('starts as a short summary of what stands out, not a wall of cards', () => {
    const onTarget = Object.fromEntries(MICRO_NUTRIENTS.map((n) => [n.key, n.defaultTarget || 0]));
    render(<DiaryTab d={dash({ microTotals: { ...onTarget, fibre: 7, calcium: 320 } })} />);
    const summary = screen.getByTestId('nutrient-summary');
    expect(summary).toHaveTextContent('Low: Fibre 25% · Calcium 32%');
    expect(screen.queryByText('B vitamins & vitamin E')).toBeNull();
    expect(screen.getByRole('button', { name: `Show all ${MICRO_NUTRIENTS.length}` })).toBeInTheDocument();
  });

  it('shows everything on request, grouped, keeping the small ones\' precision', async () => {
    render(<DiaryTab d={dash()} />);
    await openAll();
    expect(screen.getByText('B vitamins & vitamin E')).toBeInTheDocument();
    expect(screen.getByText('More minerals')).toBeInTheDocument();
    expect(screen.getByText('Omega fats, caffeine & alcohol')).toBeInTheDocument();
    expect(within(screen.getByTestId('nutrient-thiamin')).getByText(/0\.14/)).toBeInTheDocument(); // not 0.1
    expect(screen.getAllByText(/Based on 1 of 1 foods logged/).length).toBe(3); // once per extended group
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument();
  });

  it('says so when none of the day\'s foods carried the extended nutrients — and shows a dash, not 0', async () => {
    render(<DiaryTab d={dash({ extendedInfo: { withData: 0, of: 3 } })} />);
    await openAll();
    expect(screen.getAllByText(/None of the foods logged carry these/).length).toBe(3);
    expect(within(screen.getByTestId('nutrient-thiamin')).getByText('—')).toBeInTheDocument();
    expect(within(screen.getByTestId('nutrient-thiamin')).queryByText(/^0/)).toBeNull();
  });

  it('shows no extended note on the established groups, or when nothing was logged', () => {
    render(<DiaryTab d={dash({ hasAnyFood: false, meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, extendedInfo: { withData: 0, of: 0 } })} />);
    expect(screen.getByText('Nothing logged this day.')).toBeInTheDocument();
    expect(screen.queryByText(/foods logged/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull();
  });

  it('lists every nutrient when expanded — none forgotten when one is added', async () => {
    render(<DiaryTab d={dash()} />);
    await openAll();
    for (const n of MICRO_NUTRIENTS) expect(screen.getByTestId(`nutrient-${n.key}`), n.key).toBeInTheDocument();
  });

  it('flags a nutrient over its limit separately from the ones that are low', () => {
    render(<DiaryTab d={dash({ microTotals: { ...totals, sodium: 2900 } })} />);
    expect(screen.getByTestId('nutrient-summary')).toHaveTextContent('Over the limit: Sodium 126%');
  });
});

describe('DiaryTab meals', () => {
  it('shows an empty meal as one quiet line, not a card of its own', () => {
    render(<DiaryTab d={dash()} />);
    expect(screen.getByTestId('empty-meal-breakfast')).toHaveTextContent(/Breakfast.*Nothing logged/);
    expect(screen.getByTestId('empty-meal-dinner')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-meal-lunch')).toBeNull(); // lunch has food
    expect(screen.getByText('Salmon')).toBeInTheDocument();
  });
});

describe('DiaryTab day summary', () => {
  it('shows the day\'s calories and macros against the client\'s targets, above the food log', () => {
    const d = dash({ dayTotals: { calories: 1240, protein: 96.4, carbs: 130, fat: 41 }, dayTargets: { calories: 2000, protein: 150, carbs: 220, fat: 70 } });
    render(<DiaryTab d={d} />);
    const summary = screen.getByTestId('day-summary');
    expect(summary).toHaveTextContent('1,240');
    expect(summary).toHaveTextContent('2,000 kcal');
    expect(summary).toHaveTextContent('96.4g');
    expect(summary).toHaveTextContent('Protein · 150g');
    const log = screen.getByText(/^Food log —/);
    expect(summary.compareDocumentPosition(log) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('still shows the (empty) summary on a day with nothing logged', () => {
    const d = dash({ meals: { breakfast: [], lunch: [], dinner: [], snacks: [] }, hasAnyFood: false, dayTotals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, dayTargets: { calories: 2000 } });
    render(<DiaryTab d={d} />);
    expect(screen.getByTestId('day-summary')).toHaveTextContent('2,000 kcal');
  });

  it('says loading while the foods load', () => {
    render(<DiaryTab d={dash({ foodLoading: true })} />);
    expect(screen.queryByTestId('day-summary')).toBeNull();
  });
});
