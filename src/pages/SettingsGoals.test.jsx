// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', is_anonymous: false } }) }));
// A real stateful stand-in for useProfile: save() writes through to `profile`
// the way the real hook does, so the page sees the profile change after a save.
vi.mock('../hooks/useProfile', async () => {
  const React = await import('react');
  return {
    useProfile: () => {
      const [profile, setProfile] = React.useState(state.initialProfile);
      const save = React.useCallback(async (fields) => {
        const result = await state.save(fields);
        setProfile((p) => ({ ...p, ...fields }));
        return result;
      }, []);
      return { profile, save };
    },
  };
});
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

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const SLOW = { timeout: 3000 };

beforeEach(() => {
  state.save = vi.fn().mockResolvedValue(undefined);
  state.compute = vi.fn();
  state.latest = null;
});
afterEach(cleanup);

const setup = (over) => {
  state.initialProfile = profile(over);
  return render(<MemoryRouter><SettingsGoals /></MemoryRouter>);
};
const rate = (v) => fireEvent.change(screen.getByLabelText('Weekly rate'), { target: { value: String(v) } });
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

  it('explains that Custom calories are not driven by the rate', () => {
    setup({ calorie_mode: 'custom', calorie_target: 2100 });
    expect(screen.getByText(/set by hand \(Custom\), so this rate won't change it/)).toBeInTheDocument();
    cleanup();
    setup({ calorie_mode: 'calculated' });
    expect(screen.queryByText(/set by hand/)).toBeNull();
  });

  it('shows no rate controls for maintain', () => {
    setup({ goal: 'maintain', pace_kg_per_week: null });
    expect(screen.queryByLabelText('Weekly rate')).toBeNull();
  });

  it('shows the rate in pounds for imperial users but saves kg', async () => {
    setup({ unit: 'imperial', weight: 176, height: 71, target_weight: 165, pace_kg_per_week: 0.5 });
    expect(screen.getByTestId('goal-rate-value')).toHaveTextContent('1 lb/week');
    rate(0.5);
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    expect(state.save.mock.calls[0][0].pace_kg_per_week).toBeCloseTo(0.227, 3);
  });
});

describe('Settings → Goals: autosave', () => {
  it('has no Save button, and writes nothing just from opening the page', async () => {
    setup();
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    await new Promise((r) => setTimeout(r, 900));
    expect(state.save).not.toHaveBeenCalled();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('saves a change on its own, with the target recomputed from it', async () => {
    setup();
    rate(0.25);
    expect(kcal()).toBe(calcCalories({ ...stats, goal: 'lose', paceKgPerWeek: 0.25 }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1), SLOW);
    expect(state.save.mock.calls[0][0]).toMatchObject({
      pace_kg_per_week: 0.25,
      target_weight: 75,
      goal: 'lose',
      calorie_target: calcCalories({ ...stats, goal: 'lose', paceKgPerWeek: 0.25 }),
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Saved');
  });

  it('turns a run of changes into one save with the final value', async () => {
    setup();
    for (const v of [0.3, 0.4, 0.6, 0.75]) rate(v);
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    await new Promise((r) => setTimeout(r, 900));
    expect(state.save).toHaveBeenCalledTimes(1);
    expect(state.save.mock.calls[0][0].pace_kg_per_week).toBe(0.75);
  });

  it('does not snap the slider back when it keeps being edited during a save', async () => {
    const first = deferred();
    state.save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    setup();
    rate(0.25);
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1), SLOW);
    rate(0.75); // edited while the first save is still in flight
    await act(async () => { first.resolve(); });
    // the profile that just came back holds 0.25 — the draft must stay 0.75
    expect(screen.getByTestId('goal-rate-value')).toHaveTextContent('0.75 kg/week');
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2), SLOW);
    expect(state.save.mock.calls[1][0].pace_kg_per_week).toBe(0.75);
    expect(screen.getByTestId('goal-rate-value')).toHaveTextContent('0.75 kg/week');
  });

  it('shows why a save failed, does not hammer the server, and lets the user retry', async () => {
    state.save = vi.fn().mockRejectedValueOnce(new Error('permission denied for table profiles')).mockResolvedValue(undefined);
    setup();
    rate(0.25);
    const status = await screen.findByRole('status', {}, SLOW);
    await waitFor(() => expect(status).toHaveTextContent(/couldn't save your changes/i), SLOW);
    expect(status).toHaveTextContent('permission denied for table profiles');
    await new Promise((r) => setTimeout(r, 1500));
    expect(state.save).toHaveBeenCalledTimes(1); // no retry loop
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2), SLOW);
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('keeps trying on the next edit after a failure', async () => {
    state.save = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    setup();
    rate(0.25);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/couldn't save/i), SLOW);
    rate(0.5 + 0.25);
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(2), SLOW);
    expect(state.save.mock.calls[1][0].pace_kg_per_week).toBe(0.75);
  });

  it('saves a change made just before leaving the page', async () => {
    const { unmount } = setup();
    rate(0.25);
    unmount();
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1), SLOW);
    expect(state.save.mock.calls[0][0].pace_kg_per_week).toBe(0.25);
  });

  it('leaves a maintain user’s stored rate and target weight alone when they change something else', async () => {
    setup({ goal: 'maintain', pace_kg_per_week: 0.5, target_weight: 75 });
    await userEvent.selectOptions(screen.getByDisplayValue('Moderately active'), 'light');
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    const saved = state.save.mock.calls[0][0];
    expect(saved.pace_kg_per_week).toBe(0.5);
    expect(saved).not.toHaveProperty('target_weight');
  });

  it('a half-filled rest-day section is reported but does not stop everything else saving', async () => {
    setup({ rest_day_targets: null, training_days: null });
    await userEvent.click(screen.getByRole('button', { name: 'Monday' })); // training day, but no rest numbers yet
    rate(0.25);
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    const saved = state.save.mock.calls[0][0];
    expect(saved.pace_kg_per_week).toBe(0.25);
    expect(saved).not.toHaveProperty('rest_day_targets');
    expect(screen.getByText(/Enter at least one rest-day target/)).toBeInTheDocument();
  });
});

describe('Settings → Goals: adaptive mode applies the chosen rate', () => {
  const estimate = (over = {}) => ({ tdee: 2600, avgCalIn: 2000, weightChangeKg: -1.2, weeklyRateKg: -0.3, spanDays: 28, loggedDayCount: 24, ...over });

  it('offsets estimated maintenance by the rate, and compares trend to goal', async () => {
    state.compute.mockResolvedValue({ ready: true, target: 0, estimate: estimate() });
    setup({ calorie_mode: 'adaptive' });
    expect(await screen.findByTestId('adaptive-rate')).toHaveTextContent(/−0\.3 kg\/week — you're aiming for −0\.5 kg\/week/);
    expect(kcal()).toBe(2600 - 550);
    rate(0.25);
    expect(kcal()).toBe(2600 - 275);
    expect(state.compute).toHaveBeenCalledTimes(1); // slider doesn't re-query logs
  });

  it('says so when the rate would push the target under the safe minimum', async () => {
    state.compute.mockResolvedValue({ ready: true, target: 0, estimate: estimate({ tdee: 1500 }) });
    setup({ calorie_mode: 'adaptive' });
    expect(await screen.findByText(/lowest target we'll set/)).toBeInTheDocument();
    expect(kcal()).toBe(1200);
  });

  it('waits for the adaptive estimate instead of saving the placeholder number', async () => {
    const pending = deferred();
    state.compute.mockReturnValue(pending.promise);
    setup({ calorie_mode: 'calculated' });
    await userEvent.click(screen.getByRole('button', { name: 'Adaptive' }));
    await new Promise((r) => setTimeout(r, 1000));
    expect(state.save).not.toHaveBeenCalled();
    await act(async () => { pending.resolve({ ready: true, target: 0, estimate: estimate() }); });
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1), SLOW);
    expect(state.save.mock.calls[0][0]).toMatchObject({ calorie_mode: 'adaptive', calorie_target: 2600 - 550 });
  });
});

describe('Settings → Goals: diet style and net carbs', () => {
  const styleBtn = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) });
  // The % figures are tap-to-edit buttons labelled "<Macro> percent of calories".
  const pct = (label) => parseInt(screen.getByLabelText(label).textContent, 10);
  const fatSlider = (container) => container.querySelector('input[type="range"][max="80"]');
  const netToggle = () => within(screen.getByText('Count net carbs').parentElement.parentElement).getByRole('button');

  it('offers three styles and reads a goal-default split as Balanced', () => {
    setup({ goal: 'lose', protein_g: 158, carbs_g: 158, fat_g: 60 }); // 35 / 35 / 30 of 1800 kcal
    expect(styleBtn('Balanced')).toHaveAttribute('aria-pressed', 'true');
    expect(styleBtn('Low carb')).toHaveAttribute('aria-pressed', 'false');
    expect(styleBtn('Keto')).toHaveAttribute('aria-pressed', 'false');
  });

  it('Keto snaps the sliders to 25% protein / 70% fat and leaves 5% carbs', async () => {
    setup({ net_carbs: false });
    await userEvent.click(styleBtn('Keto'));
    expect(pct('Protein percent of calories')).toBe(25);
    expect(pct('Fat percent of calories')).toBe(70);
    expect(screen.getByText('5% (auto)')).toBeInTheDocument();
    expect(styleBtn('Keto')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/isn't right for everyone/)).toBeInTheDocument();
  });

  it('Keto turns net carbs on and saves it with the new split', async () => {
    setup({ net_carbs: false });
    await userEvent.click(styleBtn('Keto'));
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    const saved = state.save.mock.calls.at(-1)[0];
    expect(saved.net_carbs).toBe(true);
    const kcal = saved.calorie_target;
    expect(saved.protein_g).toBe(Math.round((kcal * 0.25) / 4));
    expect(saved.carbs_g).toBe(Math.round((kcal * 0.05) / 4));
    expect(saved.fat_g).toBe(Math.round((kcal * 0.70) / 9));
  });

  it('Low carb does not touch the net carbs setting', async () => {
    setup({ net_carbs: false });
    await userEvent.click(styleBtn('Low carb'));
    expect(pct('Protein percent of calories')).toBe(30);
    expect(pct('Fat percent of calories')).toBe(45);
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    expect(state.save.mock.calls.at(-1)[0].net_carbs).toBe(false);
  });

  it('dragging a slider off a preset reads as Custom, and Balanced goes back to the goal split', async () => {
    const { container } = setup({ net_carbs: false });
    await userEvent.click(styleBtn('Keto'));
    fireEvent.change(fatSlider(container), { target: { value: '65' } });
    expect(screen.getByText(/Custom split/)).toBeInTheDocument();
    expect(styleBtn('Keto')).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(styleBtn('Balanced'));
    expect(pct('Protein percent of calories')).toBe(35); // lose's recommended split
    expect(pct('Fat percent of calories')).toBe(30);
  });

  it('the fat slider reaches 80% so keto is possible', () => {
    const { container } = setup({});
    expect(fatSlider(container)).not.toBeNull();
  });

  it('the toggle switches net carbs on, saves it, and relabels carbs', async () => {
    setup({ net_carbs: false });
    expect(screen.queryByText('Net carbs')).toBeNull();
    await userEvent.click(netToggle());
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    expect(state.save.mock.calls.at(-1)[0].net_carbs).toBe(true);
    expect(screen.getAllByText('Net carbs').length).toBeGreaterThan(0);
  });

  it('can be switched off again after Keto turned it on', async () => {
    setup({ net_carbs: false });
    await userEvent.click(styleBtn('Keto'));
    await userEvent.click(netToggle());
    await waitFor(() => expect(state.save.mock.calls.at(-1)[0].net_carbs).toBe(false), SLOW);
  });

  it('hides the toggle — and never writes net_carbs — until the database has the column', async () => {
    setup({}); // a profile row with no net_carbs field at all
    expect(screen.queryByText('Count net carbs')).toBeNull();
    await userEvent.click(styleBtn('Keto'));
    await waitFor(() => expect(state.save).toHaveBeenCalled(), SLOW);
    expect('net_carbs' in state.save.mock.calls.at(-1)[0]).toBe(false);
  });
});
