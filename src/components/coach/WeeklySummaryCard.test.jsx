// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import WeeklySummaryCard from './WeeklySummaryCard';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const summary = { calorie_target: 2000, protein_g: 150, last_log_date: '2026-09-20', days_logged_7d: 6, days_on_target_7d: 5, days_protein_7d: 4, avg_cal_7d: 1950, latest_weight_kg: 80, weight_change_kg_14d: -0.5 };

describe('WeeklySummaryCard', () => {
  it('shows the lines for the week', () => {
    render(<WeeklySummaryCard summary={summary} clientData={{ name: 'Sam Client', unit: 'metric' }} today="2026-09-20" />);
    expect(screen.getByText('Logged food on 6 of the last 7 days (average 1,950 kcal, target 2,000)')).toBeInTheDocument();
    expect(screen.getByText('Last logged today')).toBeInTheDocument();
  });

  it('copies the summary as text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<WeeklySummaryCard summary={summary} clientData={{ name: 'Sam Client' }} today="2026-09-20" />);
    await userEvent.click(screen.getByRole('button', { name: /Copy summary/ }));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Sam — the 7 days to 20 Sept\n• Logged food on 6 of the last 7 days'));
    expect(await screen.findByRole('button', { name: /Copied/ })).toBeInTheDocument();
  });

  it('survives the clipboard being blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true });
    render(<WeeklySummaryCard summary={summary} clientData={{ name: 'Sam' }} today="2026-09-20" />);
    await userEvent.click(screen.getByRole('button', { name: /Copy summary/ }));
    expect(screen.getByRole('button', { name: /Copy summary/ })).toBeInTheDocument();
  });

  it('renders nothing without a summary (database update not applied yet)', () => {
    const { container } = render(<WeeklySummaryCard summary={undefined} clientData={{ name: 'Sam' }} today="2026-09-20" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports weight in pounds for an imperial client', () => {
    render(<WeeklySummaryCard summary={summary} clientData={{ name: 'Sam', unit: 'imperial' }} today="2026-09-20" />);
    expect(screen.getByText(/Weight −1\.1 lb over the last 2 weeks \(now 176\.4 lb\)/)).toBeInTheDocument();
  });
});
