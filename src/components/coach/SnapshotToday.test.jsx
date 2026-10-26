// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../DayHeatmapStrip', () => ({ default: () => <div /> }));
vi.mock('../MacroSplitBar', () => ({ default: () => <div /> }));
vi.mock('./MicroTargetsCard', () => ({ default: () => <div /> }));
vi.mock('./CoCoachCard', () => ({ default: () => <div /> }));
vi.mock('./NeedsAttention', () => ({ default: () => <div /> }));
vi.mock('./WeekTiles', () => ({ default: () => <div /> }));
vi.mock('./TargetsOwnership', () => ({ default: () => <div /> }));
vi.mock('./TargetsForm', () => ({ default: () => <div /> }));
import SnapshotTab from './SnapshotTab';

const d = (over = {}) => ({
  today: '2026-10-18', range: 7, setRange: vi.fn(), calorieTarget: 2000, hasCalorieTarget: true, historyLoading: false, calorieHeatmapDays: [],
  stats: { hasData: false, loggedDays: [], completeDays: [], energyDays: [], avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0, daysOnTarget: 0, avgEnergy: null },
  streaks: { logging: 0, calorie: 0, mood: 0, protein: 0 },
  todayTotals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, todayTargets: { calories: 2000, protein: 150, carbs: 220, fat: 70 },
  ...over,
});
const props = { clientData: { id: 'c', name: 'Kai', calorie_target: 2000 }, editingTargets: false, setEditingTargets: vi.fn(), onSaveTargets: vi.fn(), onSaveMicroTargets: vi.fn(), summary: null };
afterEach(cleanup);

describe('SnapshotTab today', () => {
  it('shows today\'s calories and macros for the client', () => {
    render(<SnapshotTab {...props} d={d({ todayTotals: { calories: 900, protein: 60, carbs: 80, fat: 30 } })} />);
    const summary = screen.getByTestId('day-summary');
    expect(summary).toHaveTextContent('900');
    expect(summary).toHaveTextContent('2,000 kcal');
  });
  it('says so when nothing is logged yet today', () => {
    render(<SnapshotTab {...props} d={d()} />);
    expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument();
    expect(screen.queryByTestId('day-summary')).toBeNull();
  });
  it('waits while the history loads', () => {
    render(<SnapshotTab {...props} d={d({ historyLoading: true })} />);
    expect(screen.queryByText('Nothing logged yet today.')).toBeNull();
  });
});

describe('SnapshotTab layout', () => {
  const full = { ...props, summary: { goal: 'lose' }, clientData: { id: 'c', name: 'Kai', calorie_target: 2000, protein_g: 150, carbs_g: 220, fat_g: 70, goal: 'lose' } };

  it('shows macros as one line, and only the essentials of the goal card', () => {
    render(<SnapshotTab {...full} d={d()} />);
    expect(screen.getByText('P 150g · C 220g · F 70g')).toBeInTheDocument();
    expect(screen.queryByText('Protein')).toBeNull();
  });

  it('keeps the settings that rarely change behind one row, closed to start with', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    render(<SnapshotTab {...full} d={d()} />);
    const more = screen.getByRole('button', { name: /Nutrient targets & coaching team/ });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
  });

  it('a read-only view (team owner) has no edit, no settings row', () => {
    render(<SnapshotTab {...full} readOnly d={d()} />);
    expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Nutrient targets & coaching team/ })).toBeNull();
  });

  it('the last-N-days card follows the selected range and says so', () => {
    render(<SnapshotTab {...full} d={d({ range: 30 })} />);
    expect(screen.getByText('Intake · last 30 days')).toBeInTheDocument();
  });

  it('shows averages and the logging streak when there is data', () => {
    const data = d({ stats: { hasData: true, loggedDays: [1, 2, 3], completeDays: [1, 2], energyDays: [1], avgCalories: 1890, avgProtein: 112, avgCarbs: 190, avgFat: 60, daysOnTarget: 2, avgEnergy: '7.0' }, streaks: { logging: 5, calorie: 0, mood: 2, protein: 0 } });
    render(<SnapshotTab {...full} d={data} />);
    expect(screen.getByText('1,890')).toBeInTheDocument();
    expect(screen.getByText('112g')).toBeInTheDocument();
    expect(screen.getByText(/Logging streak: 5 days/)).toBeInTheDocument();
    expect(screen.getByText(/· Check-ins 2/)).toBeInTheDocument();
    expect(screen.queryByText(/Calorie target 0/)).toBeNull(); // zero streaks aren't listed
  });
});
