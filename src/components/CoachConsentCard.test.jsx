// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import CoachConsentCard from './CoachConsentCard';
import { COACH_CAN_SEE, COACH_CAN_DO, COACH_REASSURANCE } from '../lib/coachAccess';

afterEach(cleanup);

const link = { id: 'l1', status: 'pending', trainer: { id: 't1', name: 'Jordan Lee', coach_logo_url: null } };

describe('CoachConsentCard', () => {
  it('spells out everything a coach can see and do, from the shared access list', () => {
    render(<CoachConsentCard link={link} onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByText('Jordan Lee invited you to be coached')).toBeInTheDocument();
    for (const item of [...COACH_CAN_SEE, ...COACH_CAN_DO]) expect(screen.getByText(item.text)).toBeInTheDocument();
    expect(screen.getByText(COACH_REASSURANCE)).toBeInTheDocument();
    expect(screen.getByText('Nothing is shared until you accept.')).toBeInTheDocument();
  });

  it('routes the two buttons to accept / decline for a new invitation', async () => {
    const onAccept = vi.fn();
    const onDecline = vi.fn();
    render(<CoachConsentCard link={link} onAccept={onAccept} onDecline={onDecline} />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept and connect' }));
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('reads as a one-time notice for a connection that predates consent', () => {
    render(<CoachConsentCard link={{ ...link, status: 'active' }} variant="notice" onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByText('Jordan Lee is your coach')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Got it' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing is shared until you accept.')).not.toBeInTheDocument();
  });

  it('disables both buttons while saving and shows failures', () => {
    render(<CoachConsentCard link={link} busy error="Invitation not found" onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Decline' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Invitation not found');
  });

  it('copes with a coach who has no name or logo', () => {
    render(<CoachConsentCard link={{ id: 'x', trainer: {} }} onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByText('A coach invited you to be coached')).toBeInTheDocument();
  });
});
