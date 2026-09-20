// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

// vi.mock is hoisted above imports, so what its factory returns has to be
// created in vi.hoisted too.
const { db, out } = vi.hoisted(() => ({
  db: { getFoodLogsForRange: vi.fn(), getCheckinsForRange: vi.fn(), getWeightLogsForRange: vi.fn(), getWorkoutLogsForRange: vi.fn() },
  out: { openPrintWindow: vi.fn(), downloadTextFile: vi.fn() },
}));
vi.mock('../../lib/db', () => db);
vi.mock('../../lib/download', () => out);

import ReportsTab from './ReportsTab';

const client = { id: 'c1', name: 'Sam Client' };
const clientData = { name: 'Sam Client', goal: 'lose', calorie_target: 2000, protein_g: 150, unit: 'metric' };
const food = (date, meal, calories) => ({ logged_date: date, meal, calories, protein_g: 10, carbs_g: 20, fat_g: 5 });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-20T05:00:00'));
  db.getFoodLogsForRange.mockResolvedValue([food('2026-09-19', 'breakfast', 500), food('2026-09-19', 'lunch', 700), food('2026-09-19', 'dinner', 800)]);
  db.getCheckinsForRange.mockResolvedValue([]);
  db.getWeightLogsForRange.mockResolvedValue([{ logged_date: '2026-09-01', weight: 82, unit: 'kg' }, { logged_date: '2026-09-19', weight: 80, unit: 'kg' }]);
  db.getWorkoutLogsForRange.mockResolvedValue([]);
  out.openPrintWindow.mockReset().mockReturnValue(true);
  out.downloadTextFile.mockReset();
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

const setup = () => render(<ReportsTab client={client} clientData={clientData} />);
const generate = async () => { await userEvent.click(screen.getByRole('button', { name: 'Generate report' })); await screen.findByRole('button', { name: /Download CSV/ }); };

describe('ReportsTab', () => {
  it('defaults to the last 30 days and fetches that client\'s data for exactly that range', async () => {
    setup();
    await generate();
    for (const fn of Object.values(db)) expect(fn).toHaveBeenCalledWith('c1', '2026-08-22', '2026-09-20');
  });

  it('summarises the result', async () => {
    setup();
    await generate();
    expect(screen.getByText('Days logged')).toBeInTheDocument();
    expect(screen.getAllByText('1/30')).toHaveLength(2); // the one logged day is also a complete one
    expect(screen.getByText('Complete days')).toBeInTheDocument();
    expect(screen.getByText('-2 kg')).toBeInTheDocument();
  });

  it('switches presets', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));
    await generate();
    expect(db.getFoodLogsForRange).toHaveBeenCalledWith('c1', '2026-09-14', '2026-09-20');
  });

  it('opens the printable report', async () => {
    setup();
    await generate();
    await userEvent.click(screen.getByRole('button', { name: /Print/ }));
    expect(out.openPrintWindow).toHaveBeenCalledTimes(1);
    expect(out.openPrintWindow.mock.calls[0][0]).toContain('Sam Client — Nutrition Report');
  });

  it('says so when the browser blocks the report window', async () => {
    out.openPrintWindow.mockReturnValue(false);
    setup();
    await generate();
    await userEvent.click(screen.getByRole('button', { name: /Print/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/blocked the report window/);
  });

  it('downloads a CSV named for the client and range', async () => {
    setup();
    await generate();
    await userEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    const [name, content] = out.downloadTextFile.mock.calls[0];
    expect(name).toBe('attune-sam-client-2026-08-22-to-2026-09-20.csv');
    expect(content.startsWith('﻿Date,Calories')).toBe(true);
  });

  it('adds micronutrient columns when asked', async () => {
    setup();
    await userEvent.click(screen.getByLabelText('Include micronutrient averages'));
    await generate();
    await userEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    expect(out.downloadTextFile.mock.calls[0][1].split('\r\n')[0]).toContain('Vitamin D (mcg)');
  });

  it('applies the day filter', async () => {
    setup();
    await userEvent.selectOptions(screen.getByLabelText(/Which days to include/), 'complete');
    await generate();
    await userEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    const lines = out.downloadTextFile.mock.calls[0][1].split('\r\n');
    expect(lines).toHaveLength(3); // header, the one complete day, trailing newline
    expect(lines[1].startsWith('2026-09-19,2000,')).toBe(true);
  });

  it('discards a generated report when any setting changes, so it can\'t go stale', async () => {
    setup();
    await generate();
    await userEvent.click(screen.getByLabelText('Include micronutrient averages'));
    expect(screen.queryByRole('button', { name: /Download CSV/ })).not.toBeInTheDocument();
  });

  it('validates a custom range before doing any work', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2024-01-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-20' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/366 days or fewer/);
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled();
    expect(db.getFoodLogsForRange).not.toHaveBeenCalled();
  });

  it('refuses an end date in the future', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-25' } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate report' })).toBeDisabled();
  });

  it('shows a load failure and lets the coach retry', async () => {
    db.getFoodLogsForRange.mockRejectedValueOnce(new Error('network down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setup();
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    expect(screen.getByRole('button', { name: 'Generate report' })).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Generate report' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /Download CSV/ })).toBeInTheDocument());
  });
});
