// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', is_anonymous: false } }) }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: state.profile, save: state.save }) }));
vi.mock('../hooks/useWeightLogs', () => ({ useWeightLogs: () => ({ latest: state.latest ?? null }) }));
vi.mock('../hooks/useAdaptiveTarget', () => ({ useAdaptiveTarget: () => ({ compute: state.compute }) }));

import SettingsGoals from './SettingsGoals';
import { calcCalories } from '../lib/calorieTargets';

const profile = (over = {}) => ({
  name: 'Sam', unit: 'metric', age: 30, weight: 80, height: 180, goal: 'lose', activity: 'moderate',
  sex: 'female', pace_kg_per_week: 0.5, target_weight: 75, calorie_mode: 'calculated',
  calorie_target: 1800, protein_g: 140, carbs_g: 160, fat_g: 60, water_target: 8, ...over,
});
const stats = { weight: 80, height: 180, age: 30, unit: 'metric', activity: 'moderate', sex: 'female' };

beforeEach(() => {
  state.save = vi.fn().mockResolvedValue(undefined);
  state.compute = vi.fn();
  state.latest = null;
});
afterEach(cleanup);

const setup = (over) => {
  state.profile = profile(over);
  render(<MemoryRouter><SettingsGoals /></MemoryRouter>);
};
const kcal = () => Number(screen.getAllByText(/^[\d,]{4,5}$/).map(e => e.textContent.replace(',', ''))[0]);

describe('Settings → Goals: weekly rate', () => {
  it('computes the target from the saved sex and pace, not a flat offset', () => {
    setup();
    expect(kcal()).toBe(calcCalories({ ...stats, goal: 'lose', paceKgPerWeek: 0.5 }));
    expect(screen.getByTestId('goal-rate-value')).toHaveTextContent('0.5 kg/week');
    expect(screen.getByText(/−550 kcal\/day from your maintenance/)).toBeInTheDocument();
  });

  it('goal tiles show the offset for the chosen rate', () => {
    setup();
    expect(screen.getByText('−550 kcal/day')).toBeInTheDocument();
  });

  it('moves the target live as the rate changes, and saves rate + target weight', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Weekly rate'), { target: { value: '0.25' } });
    expect(screen.getByTestId('goal-rate-value')).toHaveTextContent('0.25 kg/week');
    expect(kcal()).toBe(calcCalories({ ...stats, goal: 'lose', paceKgPerWeek: 0.25 }));

    await userEvent.click(await screen.findByRole('button', { name: /save/i }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1));
    expect(state.save.mock.calls[0][0]).toMatchObject({
      pace_kg_per_week: 0.25,
      target_weight: 75,
      goal: 'lose',
      calorie_target: calcCalories({ ...stats, goal: 'lose', paceKgPerWeek: 0.25 }),
    });
  });

  it('projects a finish date from target weight and rate', () => {
    setup(); // 80 → 75 kg at 0.5 kg/week = 10 weeks
    expect(screen.getByTestId('goal-finish')).toHaveTextContent(/about 10 weeks/);
  });

  it('uses the latest logged weight, not the stale onboarding one', () => {
    state.latest = { weight: 77.5, unit: 'kg' };
    setup(); // 77.5 → 75 at 0.5 = 5 weeks
    expect(screen.getByTestId('goal-finish')).toHaveTextContent(/about 5 weeks/);
  });

  it('warns when the rate is too aggressive for body weight', () => {
    setup({ pace_kg_per_week: 0.9 });
    expect(screen.getByRole('note')).toHaveTextContent(/1\.1% of your body weight/);
  });

  it('shows no rate controls for maintain', () => {
    setup({ goal: 'maintain', pace_kg_per_week: null });
    expect(screen.queryByLabelText('Weekly rate')).toBeNull();
  });

  it('shows the rate in pounds for imperial users but still stores kg', async () => {
    setup({ unit: 'imperial', weight: 176, height: 71, target_weight: 165, pace_kg_per_week: 0.5 });
    expect(screen.getByTestId('goal-rate-value')).toHaveTextContent('1 lb/week');
    fireEvent.change(screen.getByLabelText('Weekly rate'), { target: { value: '0.5' } });
    await userEvent.click(await screen.findByRole('button', { name: /save/i }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    expect(state.save.mock.calls[0][0].pace_kg_per_week).toBeCloseTo(0.227, 3);
  });

  it('leaves a maintain user’s stored rate and target weight alone when they save something else', async () => {
    setup({ goal: 'maintain', pace_kg_per_week: 0.5, target_weight: 75 });
    await userEvent.selectOptions(screen.getByDisplayValue('Moderately active'), 'light');
    await userEvent.click(await screen.findByRole('button', { name: /save/i }));
    await waitFor(() => expect(state.save).toHaveBeenCalled());
    const saved = state.save.mock.calls[0][0];
    expect(saved.pace_kg_per_week).toBe(0.5);
    expect(saved).not.toHaveProperty('target_weight');
  });
});

describe('Settings → Goals: adaptive mode applies the chosen rate', () => {
  it('offsets estimated maintenance by the rate, and compares trend to goal', async () => {
    state.compute.mockResolvedValue({ ready: true, target: 0, estimate: { tdee: 2600, avgCalIn: 2000, weightChangeKg: -1.2, weeklyRateKg: -0.3, spanDays: 28, loggedDayCount: 24 } });
    setup({ calorie_mode: 'adaptive' });
    expect(await screen.findByTestId('adaptive-rate')).toHaveTextContent(/−0\.3 kg\/week — you're aiming for −0\.5 kg\/week/);
    expect(kcal()).toBe(2600 - 550);
    fireEvent.change(screen.getByLabelText('Weekly rate'), { target: { value: '0.25' } });
    expect(kcal()).toBe(2600 - 275);
    expect(state.compute).toHaveBeenCalledTimes(1); // slider doesn't re-query logs
  });

  it('says so when the rate would push the target under the safe minimum', async () => {
    state.compute.mockResolvedValue({ ready: true, target: 0, estimate: { tdee: 1500, avgCalIn: 1500, weightChangeKg: 0, weeklyRateKg: 0, spanDays: 28, loggedDayCount: 24 } });
    setup({ calorie_mode: 'adaptive' });
    expect(await screen.findByText(/lowest target we'll set/)).toBeInTheDocument();
    expect(kcal()).toBe(1200);
  });
});
