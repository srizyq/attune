// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useCoach', () => ({
  useMyTrainers: () => state.trainers,
  useCoachNote: () => ({ note: null, dismiss: () => {} }),
  useGeneralThread: () => ({ messages: [], loading: false, sendReply: vi.fn() }),
}));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => ({ profile: { calorie_target: 2000, protein_g: 150 } }) }));
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1', is_anonymous: false } }) }));
vi.mock('../lib/billing', () => ({ authedPost: vi.fn() }));
vi.mock('../hooks/useCheckinForms', () => ({ useMyCheckinForms: () => ({ supported: true, forms: [], submit: vi.fn() }) }));

import ClientCoachHub from './ClientCoachHub';

const trainer = { id: 't1', name: 'Jordan Lee', coach_logo_url: null };
const row = (over = {}) => ({ id: 'l1', status: 'active', created_at: '2026-09-01T00:00:00Z', consented_at: '2026-09-02T00:00:00Z', trainer, ...over });

function setup({ links = [], initialEntry = '/coach', showUpsell = false } = {}) {
  const active = links.filter(l => l.status === 'active');
  state.trainers = {
    trainers: links, active, pending: links.filter(l => l.status === 'pending'),
    needsNotice: active.filter(l => !l.consented_at), loading: false,
    redeemCode: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn(), respond: vi.fn().mockResolvedValue(undefined),
  };
  render(<MemoryRouter initialEntries={[initialEntry]}><ClientCoachHub showUpsell={showUpsell} /></MemoryRouter>);
  return state.trainers;
}

beforeEach(() => vi.stubGlobal('confirm', vi.fn(() => false)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ClientCoachHub — consent', () => {
  it('shows a pending invitation with accept/decline, and no connect form', async () => {
    const t = setup({ links: [row({ status: 'pending', consented_at: null })] });
    expect(screen.getByText('Jordan Lee invited you to be coached')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Invite link or code')).not.toBeInTheDocument();
    expect(screen.getByText('Accept the invitation above to connect.')).toBeInTheDocument();
    // Nothing of the coach's tooling is offered before accepting.
    expect(screen.queryByRole('button', { name: 'Message coach' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Accept and connect' }));
    expect(t.respond).toHaveBeenCalledWith('l1', true);
  });

  it('declines an invitation', async () => {
    const t = setup({ links: [row({ status: 'pending', consented_at: null })] });
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(t.respond).toHaveBeenCalledWith('l1', false);
  });

  it('shows a failed response instead of failing silently', async () => {
    const t = setup({ links: [row({ status: 'pending', consented_at: null })] });
    t.respond.mockRejectedValue(new Error('This invitation is no longer available'));
    await userEvent.click(screen.getByRole('button', { name: 'Accept and connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available');
    expect(screen.getByRole('button', { name: 'Accept and connect' })).not.toBeDisabled();
  });

  it('shows the one-time notice for a pre-consent connection, and "Got it" records it', async () => {
    const t = setup({ links: [row({ consented_at: null })] });
    expect(screen.getByText('Jordan Lee is your coach')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(t.respond).toHaveBeenCalledWith('l1', true);
  });

  it('shows no notice once consent is recorded', () => {
    setup({ links: [row()] });
    expect(screen.queryByText('Jordan Lee is your coach')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Message coach' })).toBeInTheDocument();
  });

  it('asks before disconnecting and does nothing if declined', async () => {
    const t = setup({ links: [row()] });
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(t.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects once confirmed', async () => {
    window.confirm.mockReturnValue(true);
    const t = setup({ links: [row()] });
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(t.disconnect).toHaveBeenCalledWith('l1');
  });
});

describe('ClientCoachHub — connecting', () => {
  it('accepts a pasted invite link and submits it on Enter', async () => {
    const t = setup();
    await userEvent.type(screen.getByPlaceholderText('Invite link or code'), 'https://attun3.com/join/abcd2345{Enter}');
    await waitFor(() => expect(t.redeemCode).toHaveBeenCalledWith('https://attun3.com/join/abcd2345'));
  });

  it('shows the server reason when a code is rejected', async () => {
    const t = setup();
    t.redeemCode.mockRejectedValue(new Error('That invite code is invalid or no longer active'));
    await userEvent.type(screen.getByPlaceholderText('Invite link or code'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('That invite code is invalid or no longer active')).toBeInTheDocument();
  });

  it('surfaces a bad /join/ link that failed on arrival', () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/coach', state: { inviteError: 'That invite code is invalid or no longer active' } }]}>
        <ClientCoachHub showUpsell={false} />
      </MemoryRouter>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('invalid or no longer active');
  });
});
