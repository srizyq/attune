// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({}));
vi.mock('../../hooks/useTeam', () => ({ useTeam: () => h.team, useClientCoaches: () => h.coaches }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'me' } }) }));
import CoCoachCard from './CoCoachCard';

const team = { members: [
  { user_id: 'me', name: 'Olive Owner', has_pass: true },
  { user_id: 'a', name: 'Ann Mate', has_pass: true },
  { user_id: 'b', name: 'Bob NoPass', has_pass: false },
] };
const setup = ({ teamState = { supported: true, loading: false, team }, coaches = [], coachState = {} } = {}) => {
  h.team = teamState;
  h.coaches = { supported: true, loading: false, coaches, share: vi.fn().mockResolvedValue(undefined), ...coachState };
  render(<CoCoachCard clientId="c1" clientName="Sam" />);
  return h.coaches;
};
afterEach(cleanup);

describe('CoCoachCard', () => {
  it('renders nothing when you are not on a team, or the database is not updated, or while loading', () => {
    setup({ teamState: { supported: true, loading: false, team: null } });
    expect(screen.queryByText('Coaching team')).not.toBeInTheDocument();
    cleanup();
    setup({ teamState: { supported: false, loading: false, team: null } });
    expect(screen.queryByText('Coaching team')).not.toBeInTheDocument();
    cleanup();
    setup({ coachState: { supported: false } });
    expect(screen.queryByText('Coaching team')).not.toBeInTheDocument();
    cleanup();
    setup({ coachState: { loading: true } });
    expect(screen.queryByText('Coaching team')).not.toBeInTheDocument();
  });

  it('renders nothing when there is nobody to show or offer', () => {
    setup({ teamState: { supported: true, loading: false, team: { members: [team.members[0]] } } });
    expect(screen.queryByText('Coaching team')).not.toBeInTheDocument();
  });

  it('lists teammates already on the client, with whether they have accepted', () => {
    setup({ coaches: [{ id: 'a', name: 'Ann Mate', status: 'active' }, { id: 'z', name: 'Zed Mate', status: 'pending' }] });
    expect(screen.getByText('Ann Mate')).toBeInTheDocument();
    expect(screen.getByText(/is coaching/)).toBeInTheDocument();
    expect(screen.getByText(/is waiting for the client to accept/)).toBeInTheDocument();
  });

  it('offers only teammates who can take the client on', () => {
    setup();
    const options = [...screen.getByLabelText('Teammate').querySelectorAll('option')].map((o) => o.textContent);
    expect(options).toEqual(['Choose a teammate…', 'Ann Mate']); // not you, not the one without a pass
    expect(screen.getByText(/can't see anything about Sam until they do/)).toBeInTheDocument();
  });

  it('does not offer someone already coaching or already invited', () => {
    setup({ coaches: [{ id: 'a', name: 'Ann Mate', status: 'pending' }] });
    expect(screen.queryByLabelText('Teammate')).not.toBeInTheDocument(); // nobody left to offer
  });

  it('asks a teammate, and says the client will be asked', async () => {
    const c = setup();
    const send = screen.getByRole('button', { name: 'Ask Sam to accept' });
    expect(send).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Teammate'), 'a');
    await userEvent.click(send);
    expect(c.share).toHaveBeenCalledWith('a');
    expect(await screen.findByRole('status')).toHaveTextContent('Sam will be asked whether Ann Mate can coach them too');
  });

  it('shows why it was refused (for example, the client declined that teammate before)', async () => {
    setup({ coachState: { share: vi.fn().mockRejectedValue(new Error('This client has already ended coaching with that teammate')) } });
    await userEvent.selectOptions(screen.getByLabelText('Teammate'), 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Ask Sam to accept' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already ended coaching');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
