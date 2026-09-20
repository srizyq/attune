// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../hooks/useCoach', () => ({ useCoachInvites: () => state.invites }));
vi.mock('../hooks/useProfile', () => ({ useProfile: () => state.profile }));

import CoachInvitePanel from './CoachInvitePanel';

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const open = (over = {}) => ({ id: 'i1', code: 'ABCD2345', label: 'Sam', expires_at: future(5), redeemed_at: null, revoked_at: null, ...over });

function setup({ invites = [], pending = [], supported = true, loading = false, profile = {} } = {}) {
  state.invites = {
    invites, pending, supported, loading, refetch: vi.fn(),
    create: vi.fn().mockResolvedValue({}), revoke: vi.fn().mockResolvedValue(undefined),
  };
  state.profile = { profile: { coach_invite_code: null, ...profile }, save: vi.fn().mockResolvedValue({}) };
  render(<CoachInvitePanel hasClients={false} />);
  return state;
}

let writeText;
beforeEach(() => {
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});
afterEach(cleanup);

describe('CoachInvitePanel', () => {
  it('creates an invite with the typed label', async () => {
    const s = setup();
    await userEvent.type(screen.getByLabelText('Invite label'), '  Sam - cut  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(s.invites.create).toHaveBeenCalledWith('Sam - cut');
  });

  it('lists only open invites, with the code and time left', () => {
    setup({ invites: [
      open(),
      open({ id: 'i2', code: 'USED2222', redeemed_at: future(-1) }),
      open({ id: 'i3', code: 'GONE3333', revoked_at: future(-1) }),
      open({ id: 'i4', code: 'OLD44444', expires_at: future(-1) }),
    ] });
    expect(screen.getByText('ABCD2345')).toBeInTheDocument();
    expect(screen.getByText('5 days left')).toBeInTheDocument();
    for (const code of ['USED2222', 'GONE3333', 'OLD44444']) expect(screen.queryByText(code)).not.toBeInTheDocument();
  });

  it('copies a join link (not just the code) and confirms it', async () => {
    setup({ invites: [open()] });
    await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/ABCD2345`);
    expect(await screen.findByRole('button', { name: 'Copied ✓' })).toBeInTheDocument();
  });

  it('uses the native share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    setup({ invites: [open()] });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/join/ABCD2345` }));
    expect(writeText).not.toHaveBeenCalled();
  });

  it('revokes an invite', async () => {
    const s = setup({ invites: [open()] });
    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(s.invites.revoke).toHaveBeenCalledWith('i1');
  });

  it('surfaces a creation failure instead of swallowing it', async () => {
    const s = setup();
    s.invites.create.mockRejectedValue(new Error('You have 25 open invites — revoke some before creating more'));
    await userEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('25 open invites');
  });

  it('shows clients who accepted the code but are waiting on the other side', () => {
    setup({ pending: [{ link_id: 'l1', client_name: 'Sam', requested_at: new Date().toISOString() }] });
    expect(screen.getByText('Waiting for acceptance')).toBeInTheDocument();
    expect(screen.getByText('Sam')).toBeInTheDocument();
  });

  it('offers to turn off the old shared code, and only when one exists', async () => {
    const s = setup({ profile: { coach_invite_code: 'OLD222' } });
    expect(screen.getByText('OLD222')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    await waitFor(() => expect(s.profile.save).toHaveBeenCalledWith({ coach_invite_code: null }));
    cleanup();
    setup();
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });

  it('falls back to the old shared-code flow when the invites migration has not run', async () => {
    const s = setup({ supported: false });
    expect(screen.queryByRole('button', { name: 'Create invite' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Generate code' }));
    await waitFor(() => expect(s.profile.save).toHaveBeenCalledWith({ coach_invite_code: expect.stringMatching(/^[A-HJ-NP-Z2-9]{6}$/) }));
  });

  it('does not flash the fallback while still loading', () => {
    setup({ supported: false, loading: true });
    expect(screen.getByRole('button', { name: 'Create invite' })).toBeInTheDocument();
  });
});
