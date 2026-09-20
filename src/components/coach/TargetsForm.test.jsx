// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import TargetsForm from './TargetsForm';

const base = { id: 'c1', calorie_target: 2500, protein_g: 180, carbs_g: 280, fat_g: 70 };
const setup = (client, onSave = vi.fn().mockResolvedValue(undefined)) => {
  render(<TargetsForm client={client} onSave={onSave} onCancel={vi.fn()} />);
  return onSave;
};
afterEach(cleanup);

describe('TargetsForm — everyday targets', () => {
  it('saves the everyday targets exactly as before, sending no rest-day data', async () => {
    const onSave = setup({ ...base, rest_day_targets: null, training_days: null });
    await userEvent.click(screen.getByRole('button', { name: 'Save targets' }));
    expect(onSave).toHaveBeenCalledWith({ calorie_target: 2500, protein_g: 180, carbs_g: 280, fat_g: 70 }, undefined);
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

  it('shows the everyday number as the placeholder, so blank clearly means "same"', () => {
    setup(supported);
    expect(screen.getByLabelText('Rest-day calories (kcal)')).toHaveAttribute('placeholder', '2500');
    expect(screen.getByLabelText('Rest-day fat (g)')).toHaveAttribute('placeholder', '70');
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
