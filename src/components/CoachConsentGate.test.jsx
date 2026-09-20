// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const db = { getMyTrainers: vi.fn(), redeemCoachInviteCode: vi.fn(), respondToCoachLink: vi.fn(), revokeClientLink: vi.fn() };
vi.mock('../lib/db', () => db);
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

const store = new Map();
const link = (over = {}) => ({ id: 'l1', status: 'pending', consented_at: null, created_at: '2026-09-01', trainer: { id: 't1', name: 'Jordan Lee', coach_logo_url: null }, ...over });

// The gate keeps a module-level "already checked this user" flag on purpose
// (once per browser session), so each test needs a fresh module.
async function mountGate(path = '/dashboard') {
  vi.resetModules();
  const { default: CoachConsentGate } = await import('./CoachConsentGate');
  const Where = () => <div data-testid="where">{useLocation().pathname}</div>;
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="*" element={<><Where /><CoachConsentGate /></>} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) });
  Object.values(db).forEach(fn => fn.mockReset());
  db.getMyTrainers.mockResolvedValue([]);
  db.redeemCoachInviteCode.mockResolvedValue('t1');
  db.respondToCoachLink.mockResolvedValue(undefined);
  db.revokeClientLink.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CoachConsentGate — stashed invite from a /join/ link', () => {
  it('redeems it once the person is signed in, then lands them on the Coach tab', async () => {
    store.set('attune_pending_invite', 'ABCD2345');
    await mountGate('/dashboard');
    await waitFor(() => expect(db.redeemCoachInviteCode).toHaveBeenCalledWith('ABCD2345'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach'));
    expect(store.has('attune_pending_invite')).toBe(false); // consumed — a reload won't redeem it twice
  });

  it('carries a failure (expired / used / revoked) to the Coach tab instead of dropping it', async () => {
    store.set('attune_pending_invite', 'DEAD2222');
    db.redeemCoachInviteCode.mockRejectedValue(new Error('That invite code is invalid or no longer active'));
    await mountGate('/dashboard');
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach'));
    expect(db.redeemCoachInviteCode).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there is no stashed invite', async () => {
    await mountGate('/dashboard');
    await waitFor(() => expect(db.getMyTrainers).toHaveBeenCalled());
    expect(db.redeemCoachInviteCode).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
  });
});

describe('CoachConsentGate — connections awaiting an answer', () => {
  it('shows a pending invitation as a modal on any page, and accepting records consent', async () => {
    db.getMyTrainers.mockResolvedValue([link()]);
    await mountGate('/dashboard');
    expect(await screen.findByText('Jordan Lee invited you to be coached')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Accept and connect' }));
    expect(db.respondToCoachLink).toHaveBeenCalledWith('l1', true);
    await waitFor(() => expect(screen.queryByText('Jordan Lee invited you to be coached')).not.toBeInTheDocument());
  });

  it('shows the one-time notice for a pre-consent connection; Disconnect revokes it', async () => {
    db.getMyTrainers.mockResolvedValue([link({ status: 'active' })]);
    await mountGate('/log');
    expect(await screen.findByText('Jordan Lee is your coach')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(db.revokeClientLink).toHaveBeenCalledWith('l1');
  });

  it('stays quiet for connections that already consented, and for revoked-state rows', async () => {
    db.getMyTrainers.mockResolvedValue([link({ status: 'active', consented_at: '2026-09-02' })]);
    await mountGate('/dashboard');
    await waitFor(() => expect(db.getMyTrainers).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Accept|Got it/ })).not.toBeInTheDocument();
  });

  it('does not double up on /coach, which shows the same card inline', async () => {
    db.getMyTrainers.mockResolvedValue([link()]);
    await mountGate('/coach');
    await waitFor(() => expect(db.getMyTrainers).toHaveBeenCalled());
    expect(screen.queryByText('Jordan Lee invited you to be coached')).not.toBeInTheDocument();
  });

  it('"Decide later" closes it without answering', async () => {
    db.getMyTrainers.mockResolvedValue([link()]);
    await mountGate('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Decide later' }));
    await waitFor(() => expect(screen.queryByText('Jordan Lee invited you to be coached')).not.toBeInTheDocument());
    expect(db.respondToCoachLink).not.toHaveBeenCalled();
  });

  it('keeps the modal open and shows the error if the answer fails', async () => {
    db.getMyTrainers.mockResolvedValue([link()]);
    db.respondToCoachLink.mockRejectedValue(new Error('Invitation not found'));
    await mountGate('/dashboard');
    await userEvent.click(await screen.findByRole('button', { name: 'Accept and connect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invitation not found');
    expect(screen.getByText('Jordan Lee invited you to be coached')).toBeInTheDocument();
  });

  it('walks through several waiting connections one at a time', async () => {
    db.getMyTrainers.mockResolvedValue([link({ id: 'a', trainer: { id: 't1', name: 'Ann' } }), link({ id: 'b', trainer: { id: 't2', name: 'Bo' } })]);
    await mountGate('/dashboard');
    expect(await screen.findByText('Ann invited you to be coached')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decide later (1 more waiting)' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(await screen.findByText('Bo invited you to be coached')).toBeInTheDocument();
  });

  it('survives the connection check failing', async () => {
    db.getMyTrainers.mockRejectedValue(new Error('network'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountGate('/dashboard');
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getByTestId('where')).toHaveTextContent('/dashboard');
    spy.mockRestore();
  });
});
