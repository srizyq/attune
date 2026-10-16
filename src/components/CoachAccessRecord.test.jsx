// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CoachAccessRecord from './CoachAccessRecord';
import { COACH_CAN_SEE, COACH_CAN_DO } from '../lib/coachAccess';

afterEach(cleanup);
const link = { id: 'l1', created_at: '2026-10-01T02:00:00Z', consented_at: '2026-10-01T02:05:00Z', trainer: { id: 'coach-1', name: 'Jordan Lee' } };

describe('CoachAccessRecord', () => {
  it('shows what has happened, with dates', () => {
    render(<CoachAccessRecord link={link} profile={{ targets_set_by: 'coach-1', targets_set_at: '2026-10-12T02:00:00Z' }} />);
    expect(screen.getByText('Access record')).toBeInTheDocument();
    expect(screen.getByText('Connected with Jordan Lee')).toBeInTheDocument();
    expect(screen.getByText('You accepted what they can see and do')).toBeInTheDocument();
    expect(screen.getByText('Jordan Lee set your calorie and macro targets')).toBeInTheDocument();
  });

  it('lists everything the coach can see and do, from the same lists the consent screen uses', () => {
    render(<CoachAccessRecord link={link} profile={{}} />);
    for (const i of [...COACH_CAN_SEE, ...COACH_CAN_DO]) expect(screen.getByText(i.text)).toBeInTheDocument();
    expect(screen.getByText(/lose access immediately/)).toBeInTheDocument();
    expect(screen.getByText(/Reports they've already downloaded stay with them/)).toBeInTheDocument();
  });
});
