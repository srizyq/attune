// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import RestDayTargetsCard from './RestDayTargetsCard';

const empty = { calories: '', protein_g: '', carbs_g: '', fat_g: '' };
const setup = (over = {}) => {
  const onChange = vi.fn();
  render(<RestDayTargetsCard inputs={empty} trainingDays={[]} onChange={onChange} baseTargets={{ calories: 2500, protein_g: 180, carbs_g: 280, fat_g: 70 }} adaptive={false} error={null} {...over} />);
  return onChange;
};
afterEach(cleanup);

describe('RestDayTargetsCard', () => {
  // The card reports each change as a function of the latest state; apply it to a starting state.
  const applied = (onChange, from) => onChange.mock.lastCall[0](from);

  it('offers Monday-first weekday toggles that report the change', async () => {
    const onChange = setup({ trainingDays: [1] });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(screen.getByRole('button', { name: 'Monday' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Sunday' }));
    expect(applied(onChange, { inputs: empty, trainingDays: [1] })).toEqual({ inputs: empty, trainingDays: [1, 0] });
    await userEvent.click(screen.getByRole('button', { name: 'Monday' }));
    expect(applied(onChange, { inputs: empty, trainingDays: [1] })).toEqual({ inputs: empty, trainingDays: [] });
  });

  it('builds on the latest state, so quick successive changes cannot overwrite each other', async () => {
    const onChange = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Tuesday' }));
    await userEvent.click(screen.getByRole('button', { name: 'Friday' }));
    // Both updates applied in order to whatever the parent's state was at that moment.
    const [first, second] = onChange.mock.calls.map((c) => c[0]);
    expect(second(first({ inputs: empty, trainingDays: [] }))).toEqual({ inputs: empty, trainingDays: [2, 5] });
  });

  it('reports typed targets and shows the everyday number as the placeholder', async () => {
    const onChange = setup();
    const cal = screen.getByLabelText('Rest-day calories (kcal)');
    expect(cal).toHaveAttribute('placeholder', '2500');
    await userEvent.type(cal, '1');
    expect(applied(onChange, { inputs: empty, trainingDays: [3] })).toEqual({ inputs: { ...empty, calories: '1' }, trainingDays: [3] });
  });

  it('in adaptive mode explains why it is unavailable instead of offering inputs', () => {
    setup({ adaptive: true });
    expect(screen.getByText(/Adaptive calories re-work your everyday target/)).toBeInTheDocument();
    expect(screen.getByText(/turns any rest-day targets off/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Rest-day calories (kcal)')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Monday' })).not.toBeInTheDocument();
  });

  it('shows a validation error', () => {
    setup({ error: 'Choose which weekdays are training days.' });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose which weekdays');
  });
});
