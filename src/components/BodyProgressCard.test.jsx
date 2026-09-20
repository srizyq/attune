// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useBodyProgress', () => ({ useBodyMeasurements: () => state.m, useProgressPhotos: () => state.p }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: { unit: state.unit || 'metric' } }) }));
vi.mock('../lib/patterns', () => ({ todayLocalDate: () => '2026-09-20' }));
import BodyProgressCard from './BodyProgressCard';

function setup({ m = {}, p = {}, unit } = {}) {
  state.unit = unit;
  state.m = { rows: [], supported: true, loading: false, save: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), ...m };
  state.p = { photos: [], urls: {}, supported: true, loading: false, add: vi.fn().mockResolvedValue(undefined), remove: vi.fn(), ...p };
  return render(<BodyProgressCard />);
}
afterEach(cleanup);

describe('BodyProgressCard', () => {
  it('renders nothing until the database update has been applied', () => {
    const { container } = setup({ m: { supported: false }, p: { supported: false } });
    expect(container).toBeEmptyDOMElement();
  });

  it('still shows what works when only one half is available', () => {
    setup({ m: { supported: false } });
    expect(screen.queryByLabelText(/Measurement/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Add a progress photo')).toBeInTheDocument();
    cleanup();
    setup({ p: { supported: false } });
    expect(screen.getByLabelText(/Measurement/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Add a progress photo')).not.toBeInTheDocument();
  });

  it('saves a measurement in the profile\'s unit for the chosen date', async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/Value/), '82.5');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.m.save).toHaveBeenCalledWith({ date: '2026-09-20', kind: 'waist', value: 82.5, unit: 'cm' });
    expect(screen.getByLabelText(/Value/)).toHaveValue(null);
  });

  it('uses inches for an imperial profile and a percentage for body fat', async () => {
    setup({ unit: 'imperial' });
    expect(screen.getByLabelText('Value (in)')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Measurement'), 'body_fat');
    expect(screen.getByLabelText('Value (%)')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Value (%)'), '18');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(state.m.save).toHaveBeenCalledWith(expect.objectContaining({ kind: 'body_fat', unit: 'pct', value: 18 }));
  });

  it('will not save an empty, zero, negative, or impossible value', async () => {
    setup();
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    for (const v of ['0', '-4']) { await userEvent.clear(screen.getByLabelText(/Value/)); await userEvent.type(screen.getByLabelText(/Value/), v); expect(save).toBeDisabled(); }
    await userEvent.selectOptions(screen.getByLabelText('Measurement'), 'body_fat');
    await userEvent.clear(screen.getByLabelText(/Value/));
    await userEvent.type(screen.getByLabelText(/Value/), '90');
    expect(save).toBeDisabled();
  });

  it('shows the failure and keeps the value when saving fails', async () => {
    setup({ m: { save: vi.fn().mockRejectedValue(new Error('row-level security')) } });
    await userEvent.type(screen.getByLabelText(/Value/), '80');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('row-level security');
    expect(screen.getByLabelText(/Value/)).toHaveValue(80);
  });

  it('summarises the latest reading and its change', () => {
    setup({ m: { rows: [
      { id: '1', kind: 'waist', logged_date: '2026-09-20', value: 81, unit: 'cm' },
      { id: '2', kind: 'waist', logged_date: '2026-09-01', value: 83, unit: 'cm' },
    ] } });
    expect(screen.getByText('81 cm')).toBeInTheDocument();
    expect(screen.getByText('−2')).toBeInTheDocument();
  });

  it('uploads a chosen photo, dated today', async () => {
    setup();
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Add a progress photo'), { target: { files: [file] } });
    await waitFor(() => expect(state.p.add).toHaveBeenCalledWith(file, '2026-09-20'));
  });

  it('rejects a non-image before uploading anything', async () => {
    setup();
    fireEvent.change(screen.getByLabelText('Add a progress photo'), { target: { files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn.t an image/);
    expect(state.p.add).not.toHaveBeenCalled();
  });

  it('shows an upload failure', async () => {
    setup({ p: { add: vi.fn().mockRejectedValue(new Error('Bucket not found')) } });
    fireEvent.change(screen.getByLabelText('Add a progress photo'), { target: { files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Bucket not found');
  });

  it('tells the client who can see it', () => {
    setup();
    expect(screen.getByText(/Only you/)).toBeInTheDocument();
  });
});
