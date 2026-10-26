// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import NeedsAttention from './NeedsAttention';

afterEach(cleanup);
const TODAY = '2026-10-16';
const ok = { goal: 'lose', pace_kg_per_week: 0.5, calorie_target: 2000, protein_g: 150, connected_at: '2026-08-01T00:00:00Z', last_log_date: '2026-10-16', days_logged_7d: 7, days_judged_7d: 7, days_on_target_7d: 7, days_protein_7d: 7, days_complete_7d: 7, weight_rate_kg_week: -0.45 };
const setup = (summary, props = {}) => {
  const handlers = { onMessage: vi.fn(), onAdjustTargets: vi.fn() };
  render(<NeedsAttention summary={{ ...ok, ...summary }} today={TODAY} clientName="Maya Patel" {...handlers} {...props} />);
  return handlers;
};

describe('NeedsAttention', () => {
  it('renders nothing for a client who is doing well', () => {
    const { container } = render(<NeedsAttention summary={ok} today={TODAY} clientName="Maya" onMessage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each reason once, in one block, with a count', () => {
    setup({ last_log_date: '2026-10-10', days_logged_7d: 1, weight_rate_kg_week: -0.02 });
    expect(screen.getByRole('status', { name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByText(/Needs attention · 2/)).toBeInTheDocument();
    expect(screen.getByText('No logs in 6 days')).toBeInTheDocument();
    expect(screen.getAllByText(/Weight not moving/)).toHaveLength(1);
  });

  it('explains what a weight flag means and what to check first', () => {
    setup({ weight_rate_kg_week: -0.02 });
    expect(screen.getByText(/Look at logged intake first/)).toBeInTheDocument();
  });

  it('offers a message to the client, drafted for the top reason and not sent', async () => {
    const { onMessage } = setup({ last_log_date: '2026-10-10', days_logged_7d: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'Message Maya' }));
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0]).toMatch(/^Hi Maya — I haven't seen anything logged/);
  });

  it('offers to adjust targets only when the reason is about targets or weight', async () => {
    const { onAdjustTargets } = setup({ weight_rate_kg_week: -0.02 });
    await userEvent.click(screen.getByRole('button', { name: 'Adjust targets' }));
    expect(onAdjustTargets).toHaveBeenCalled();
    cleanup();
    setup({ last_log_date: '2026-10-10', days_logged_7d: 1 });
    expect(screen.queryByRole('button', { name: 'Adjust targets' })).toBeNull(); // they just need a nudge to log
  });

  it('read-only (a team owner) shows the reasons but no buttons', () => {
    setup({ last_log_date: '2026-10-10', days_logged_7d: 1 }, { readOnly: true });
    expect(screen.getByText('No logs in 6 days')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
