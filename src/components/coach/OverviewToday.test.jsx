// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../DayHeatmapStrip', () => ({ default: () => <div /> }));
vi.mock('../MacroSplitBar', () => ({ default: () => <div /> }));
vi.mock('./MicroTargetsCard', () => ({ default: () => <div /> }));
vi.mock('./CoCoachCard', () => ({ default: () => <div /> }));
vi.mock('./WeeklySummaryCard', () => ({ default: () => <div /> }));
vi.mock('./WeightPlanCard', () => ({ default: () => <div /> }));
vi.mock('./TargetsOwnership', () => ({ default: () => <div /> }));
vi.mock('./TargetsForm', () => ({ default: () => <div /> }));
import OverviewTab from './OverviewTab';

const d = (over = {}) => ({
  today: '2026-10-18', range: 7, setRange: vi.fn(), calorieTarget: 2000, hasCalorieTarget: true, historyLoading: false, calorieHeatmapDays: [],
  stats: { hasData: false, loggedDays: [], completeDays: [], energyDays: [], avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0, daysOnTarget: 0, avgEnergy: null },
  streaks: { logging: 0, calorie: 0, mood: 0, protein: 0 },
  todayTotals: { calories: 0, protein: 0, carbs: 0, fat: 0 }, todayTargets: { calories: 2000, protein: 150, carbs: 220, fat: 70 },
  ...over,
});
const props = { clientData: { id: 'c', name: 'Kai', calorie_target: 2000 }, editingTargets: false, setEditingTargets: vi.fn(), onSaveTargets: vi.fn(), onSaveMicroTargets: vi.fn(), summary: null };
afterEach(cleanup);

describe('OverviewTab today', () => {
  it('shows today\'s calories and macros for the client', () => {
    render(<OverviewTab {...props} d={d({ todayTotals: { calories: 900, protein: 60, carbs: 80, fat: 30 } })} />);
    const summary = screen.getByTestId('day-summary');
    expect(summary).toHaveTextContent('900');
    expect(summary).toHaveTextContent('2,000 kcal');
  });
  it('says so when nothing is logged yet today', () => {
    render(<OverviewTab {...props} d={d()} />);
    expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument();
    expect(screen.queryByTestId('day-summary')).toBeNull();
  });
  it('waits while the history loads', () => {
    render(<OverviewTab {...props} d={d({ historyLoading: true })} />);
    expect(screen.queryByText('Nothing logged yet today.')).toBeNull();
  });
});
