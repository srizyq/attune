// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', is_anonymous: false, email: 'sam@example.test' } }) }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: state.profile, refetch: vi.fn() }) }));

import Settings from './Settings';

const setup = (profile = {}) => {
  state.profile = profile;
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/pricing" element={<div>PRICING_PAGE_MARKER</div>} />
      </Routes>
    </MemoryRouter>
  );
};
afterEach(cleanup);

describe('Settings — Plans & Billing is reachable (not buried behind a paywall prompt)', () => {
  it('shows a Plans & Billing row that goes straight to /pricing', async () => {
    setup({});
    expect(screen.getByText('Plans & Billing')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Plans & Billing'));
    expect(screen.getByText('PRICING_PAGE_MARKER')).toBeInTheDocument();
  });

  it('summarises the current plan state in the row', () => {
    setup({ is_premium: false, coach_pass: false });
    expect(screen.getByText('Compare plans')).toBeInTheDocument();
    cleanup();
    setup({ is_premium: true, coach_pass: false });
    expect(screen.getByText('Pro')).toBeInTheDocument();
    cleanup();
    setup({ is_premium: false, coach_pass: true });
    expect(screen.getByText('Coach Pass (includes Pro)')).toBeInTheDocument();
    cleanup();
    setup({ is_premium: true, coach_pass: true });
    expect(screen.getByText('Pro · Coach Pass')).toBeInTheDocument();
  });

  it('surfaces Plans & Billing from the settings search', async () => {
    setup({});
    await userEvent.type(screen.getByPlaceholderText('Search settings…'), 'pricing');
    await userEvent.click(screen.getByText('Compare Pro & Coach Pass'));
    expect(screen.getByText('PRICING_PAGE_MARKER')).toBeInTheDocument();
  });
});
