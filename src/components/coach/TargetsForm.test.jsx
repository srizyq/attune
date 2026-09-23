// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import TargetsForm from './TargetsForm';

const base = { id: 'c1', calorie_target: 2500, protein_g: 180, carbs_g: 280, fat_g: 70 };
const setup = (client, onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(<TargetsForm client={client} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
};
const setCalories = (value) => fireEvent.change(screen.getByLabelText('Calorie target (kcal)'), { target: { value } });
const proteinSlider = () => screen.getByLabelText('Protein share of calories');
const fatSlider = () => screen.getByLabelText('Fat share of calories');
afterEach(cleanup);

describe('TargetsForm — calories drive the macros', () => {
  it('opens an existing client at the whole-percent split closest to their stored grams, and saves grams recomputed from it', async () => {
    // 180/280/70g at 2500 kcal is a 29/45/26 split once rounded to whole percent —
    // buildTargets from that split gives 181/281/72, a gram or two off the
    // originally stored numbers (see the file-header comment on TargetsForm).
    const onSave = setup(base);
    expect(proteinSlider()).toHaveValue('29');
    expect(fatSlider()).toHaveValue('26');
    expect(screen.getByText(/Carbs \(45%\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave).toHaveBeenCalledWith({ calorie_target: 2500, protein_g: 181, carbs_g: 281, fat_g: 72 }, undefined);
  });

  it('has no gram inputs to type into — only calories and the two sliders', () => {
    setup(base);
    expect(screen.queryByLabelText('Protein (g)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Carbs (g)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fat (g)')).not.toBeInTheDocument();
  });

  it('recomputes every gram automatically when the coach only changes the calorie number', async () => {
    const onSave = setup(base);
    setCalories('2000');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    // Same 29/45/26 split as above, just at the new calorie total.
    expect(onSave).toHaveBeenCalledWith({ calorie_target: 2000, protein_g: 145, carbs_g: 225, fat_g: 58 }, undefined);
  });

  it('recomputes the preview live as calories change, without touching the split', () => {
    setup(base);
    setCalories('2000');
    expect(proteinSlider()).toHaveValue('29');
    expect(fatSlider()).toHaveValue('26');
    expect(screen.getByText('145g', { exact: false })).toBeInTheDocument();
  });

  it('moving the protein slider takes from carbs, not fat, and saves the new grams', async () => {
    const onSave = setup(base);
    fireEvent.change(proteinSlider(), { target: { value: '40' } });
    expect(fatSlider()).toHaveValue('26'); // unmoved
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave).toHaveBeenCalledWith({ calorie_target: 2500, protein_g: 250, carbs_g: 213, fat_g: 72 }, undefined);
  });

  it('never lets protein and fat between them claim more than 100%, so carbs can\'t go negative', async () => {
    setup(base);
    fireEvent.change(proteinSlider(), { target: { value: '60' } }); // protein 60, fat clamped to leave carbs >= 0
    fireEvent.change(fatSlider(), { target: { value: '50' } });
    expect(fatSlider()).toHaveValue('40'); // min(50, 100 - 60)
    expect(screen.getByText(/Carbs \(0%\)/)).toBeInTheDocument();
  });

  it('clamps the protein slider itself the same way, when fat is raised first', () => {
    setup(base);
    fireEvent.change(fatSlider(), { target: { value: '50' } });
    fireEvent.change(proteinSlider(), { target: { value: '60' } });
    expect(proteinSlider()).toHaveValue('50'); // min(60, 100 - 50)
    expect(screen.getByText(/Carbs \(0%\)/)).toBeInTheDocument();
  });

  it('defaults a client with no targets at all to the standard "maintain" split', () => {
    setup({ id: 'c2' });
    expect(proteinSlider()).toHaveValue('30');
    expect(fatSlider()).toHaveValue('30');
    expect(screen.getByText(/Carbs \(40%\)/)).toBeInTheDocument();
  });

  it('uses the goal\'s recommended split for a client with a goal but no targets yet', () => {
    setup({ id: 'c3', goal: 'lose' }); // lose: 35/35/30
    expect(proteinSlider()).toHaveValue('35');
    expect(fatSlider()).toHaveValue('30');
  });

  it('clearing the calorie field clears every target, not just calories', async () => {
    const onSave = setup(base);
    setCalories('');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave).toHaveBeenCalledWith({ calorie_target: null, protein_g: null, carbs_g: null, fat_g: null }, undefined);
  });

  it('hides the rest-day section until the database has the columns (no such field on the client)', async () => {
    const onSave = setup(base);
    expect(screen.queryByText('Rest days (optional)')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave).toHaveBeenCalledWith(expect.any(Object), undefined);
  });
});

describe('TargetsForm — rest days', () => {
  const supported = { ...base, rest_day_targets: null, training_days: null };

  it('sets training days and rest-day targets, sent with the save', async () => {
    const onSave = setup(supported);
    await userEvent.click(screen.getByRole('button', { name: 'Friday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Monday' }));
    await userEvent.type(screen.getByLabelText('Rest-day calories (kcal)'), '1800');
    await userEvent.type(screen.getByLabelText('Rest-day protein (g)'), '150');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ calorie_target: 2500 }), { rest: { calories: 1800, protein_g: 150 }, trainingDays: [1, 5] });
  });

  it('shows the computed everyday numbers as the placeholder, so blank clearly means "same"', () => {
    setup(supported);
    expect(screen.getByLabelText('Rest-day calories (kcal)')).toHaveAttribute('placeholder', '2500');
    expect(screen.getByLabelText('Rest-day fat (g)')).toHaveAttribute('placeholder', '72'); // computed, see the split-rounding test above
  });

  it('marks the chosen weekdays and loads existing ones', () => {
    setup({ ...base, rest_day_targets: { calories: 1800 }, training_days: [1, 3] });
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Rest-day calories (kcal)')).toHaveValue(1800);
  });

  it('only sends rest-day data when it changed', async () => {
    const onSave = setup({ ...base, rest_day_targets: { calories: 1800 }, training_days: [1, 3] });
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave.mock.calls[0][1]).toBeUndefined();
  });

  it('clears them when the coach empties everything', async () => {
    const onSave = setup({ ...base, rest_day_targets: { calories: 1800 }, training_days: [1] });
    await userEvent.clear(screen.getByLabelText('Rest-day calories (kcal)'));
    await userEvent.click(screen.getByRole('button', { name: 'Monday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave.mock.calls[0][1]).toEqual({ rest: null, trainingDays: null });
  });

  it('explains a half-finished setup instead of saving it', async () => {
    const onSave = setup(supported);
    await userEvent.type(screen.getByLabelText('Rest-day calories (kcal)'), '1800');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose which weekdays are training days');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a save failure and stays editable', async () => {
    const onSave = setup({ ...supported }, vi.fn().mockRejectedValue(new Error('Rest-day targets need the latest database update')));
    await userEvent.click(screen.getByRole('button', { name: 'Friday' }));
    await userEvent.type(screen.getByLabelText('Rest-day calories (kcal)'), '1800');
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('latest database update');
    expect(screen.getByRole('button', { name: 'Save targets' })).toBeEnabled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
