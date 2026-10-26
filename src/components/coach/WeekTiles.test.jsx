// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import WeekTiles from './WeekTiles';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const summary = { goal: 'lose', pace_kg_per_week: 0.5, calorie_target: 2000, protein_g: 150, last_log_date: '2026-09-20', days_logged_7d: 6, days_complete_7d: 4, days_judged_7d: 6, days_on_target_7d: 3, days_protein_7d: 3, avg_cal_7d: 1950, latest_weight_kg: 80, weight_rate_kg_week: -0.45, weigh_ins_28d: 10, weight_change_kg_14d: -0.9 };
const client = { name: 'Sam Client', unit: 'metric' };

describe('WeekTiles', () => {
  it('shows the three numbers, with the weight status in words', () => {
    render(<WeekTiles summary={summary} clientData={client} today="2026-09-20" />);
    expect(within(screen.getByTestId('tile-logging')).getByText('6/7')).toBeInTheDocument();
    expect(within(screen.getByTestId('tile-target')).getByText('3/6')).toBeInTheDocument();
    const weight = screen.getByTestId('tile-weight');
    expect(within(weight).getByText('−0.45')).toBeInTheDocument();
    expect(within(weight).getByText('On plan')).toBeInTheDocument();
  });

  it('says "Not moving" for a flat client', () => {
    render(<WeekTiles summary={{ ...summary, weight_rate_kg_week: -0.02 }} clientData={client} today="2026-09-20" />);
    expect(within(screen.getByTestId('tile-weight')).getByText('Not moving')).toBeInTheDocument();
  });

  it('uses the client\'s unit', () => {
    render(<WeekTiles summary={summary} clientData={{ ...client, unit: 'imperial' }} today="2026-09-20" />);
    expect(screen.getByTestId('tile-weight')).toHaveTextContent('lb/wk');
  });

  it('copies the written summary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<WeekTiles summary={summary} clientData={client} today="2026-09-20" />);
    await userEvent.click(screen.getByRole('button', { name: /Copy summary/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^Sam — the 7 days to .*\n.*Logged food on 6 of the last 7 days/));
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('survives the clipboard being blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    render(<WeekTiles summary={summary} clientData={client} today="2026-09-20" />);
    await userEvent.click(screen.getByRole('button', { name: /Copy summary/ }));
    expect(screen.getByRole('button', { name: /Copy summary/ })).toBeInTheDocument();
  });

  it('renders nothing without a summary (database update not applied yet)', () => {
    expect(render(<WeekTiles summary={undefined} clientData={client} today="2026-09-20" />).container).toBeEmptyDOMElement();
  });
});
