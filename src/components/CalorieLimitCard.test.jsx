// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import CalorieLimitCard from './settings/CalorieLimitCard';
import CalorieLimitBanner from './CalorieLimitBanner';

afterEach(cleanup);

const TODAY = '2026-10-04';
const base = { is_premium: true, calorie_target: 2200, protein_g: 165, carbs_g: 220, fat_g: 73, calorie_limit_periods: [] };
const active = { id: 'a', start: '2026-10-01', end: '2026-10-14', calories: 1760, created_at: 'x' };

function setup(profile = base, over = {}) {
  const props = { profile, today: TODAY, onSave: vi.fn().mockResolvedValue(), onUpgrade: vi.fn(), onConfirmEmail: vi.fn(), ...over };
  render(<CalorieLimitCard {...props} />);
  return props;
}

describe('CalorieLimitCard · not Pro', () => {
  it('shows a locked card with an upgrade button and no form', async () => {
    const { onUpgrade } = setup({ ...base, is_premium: false });
    expect(screen.queryByLabelText('Calories a day')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/ }));
    expect(onUpgrade).toHaveBeenCalled();
  });
  it('asks an unconfirmed account to confirm their email first', async () => {
    const { onConfirmEmail, onUpgrade } = setup({ ...base, is_premium: false }, { pendingConfirmation: true });
    await userEvent.click(screen.getByRole('button', { name: /Confirm your email/ }));
    expect(onConfirmEmail).toHaveBeenCalled();
    expect(onUpgrade).not.toHaveBeenCalled();
  });
});

describe('CalorieLimitCard · starting a limit', () => {
  it('suggests a number a little under the usual target', () => {
    setup();
    expect(screen.getByLabelText('Calories a day')).toHaveValue(1900);
  });

  it('starts today for the chosen length and saves it', async () => {
    const { onSave } = setup();
    const cal = screen.getByLabelText('Calories a day');
    await userEvent.clear(cal);
    await userEvent.type(cal, '1760');
    await userEvent.click(screen.getByRole('button', { name: '2 weeks', pressed: true }));
    expect(screen.getByText(/Today until/)).toHaveTextContent('Sat, 17 Oct'); // 14 days counting the 4th
    expect(screen.getByText(/Protein 132g · Carbs 176g · Fat 58g/)).toBeInTheDocument();
    expect(screen.getByText(/440 kcal a day less than usual/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start limit' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toEqual([expect.objectContaining({ start: TODAY, end: '2026-10-17', calories: 1760 })]);
  });

  it('shows why a too-low number is refused, and does not save', async () => {
    const { onSave } = setup();
    const cal = screen.getByLabelText('Calories a day');
    await userEvent.clear(cal);
    await userEvent.type(cal, '900');
    await userEvent.click(screen.getByRole('button', { name: 'Start limit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/lowest limit/);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a custom end date needs picking before it can start', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Pick a date' }));
    expect(screen.getByRole('button', { name: 'Start limit' })).toBeDisabled();
  });

  it('reports a failed save and stays on the form', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(base, { onSave: vi.fn().mockRejectedValue(new Error('offline')) });
    await userEvent.click(screen.getByRole('button', { name: 'Start limit' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't save/);
    expect(screen.getByRole('button', { name: 'Start limit' })).toBeEnabled();
  });
});

describe('CalorieLimitCard · a limit is running', () => {
  const running = { ...base, calorie_limit_periods: [active] };
  it('shows the limit, days left and the scaled macros instead of the form', () => {
    setup(running);
    expect(screen.getByText(/1,760/)).toBeInTheDocument();
    expect(screen.getByText(/11 days left/)).toBeInTheDocument();
    expect(screen.getByText(/Protein 132g/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Calories a day')).toBeNull();
  });
  it('ending it early asks first, then cuts it to end yesterday', async () => {
    const { onSave } = setup(running);
    await userEvent.click(screen.getByRole('button', { name: 'End limit early' }));
    expect(onSave).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Yes, end it now' }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0][0]).toMatchObject({ id: 'a', end: '2026-10-03' });
  });
  it('"Keep it" backs out without saving', async () => {
    const { onSave } = setup(running);
    await userEvent.click(screen.getByRole('button', { name: 'End limit early' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'End limit early' })).toBeInTheDocument();
  });
  it('lists finished limits', () => {
    setup({ ...base, calorie_limit_periods: [{ ...active, id: 'old', start: '2026-08-01', end: '2026-08-14', calories: 1800 }] });
    expect(screen.getByText('Past limits')).toBeInTheDocument();
    expect(screen.getByText('1,800 kcal a day')).toBeInTheDocument();
    expect(screen.getByLabelText('Calories a day')).toBeInTheDocument(); // and a new one can be started
  });
});

describe('CalorieLimitBanner', () => {
  it('renders nothing without a limit', () => {
    const { container } = render(<MemoryRouter><CalorieLimitBanner limit={null} today={TODAY} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
  it('says what the limit is and how long is left', () => {
    render(<MemoryRouter><CalorieLimitBanner limit={active} today={TODAY} /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('1,760 kcal limit');
    expect(screen.getByRole('status')).toHaveTextContent('11 days left');
    expect(screen.getByRole('button', { name: 'Manage' })).toBeInTheDocument();
  });
  it('says "1 day left" on the last day', () => {
    render(<MemoryRouter><CalorieLimitBanner limit={active} today="2026-10-14" /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('1 day left');
  });
});
