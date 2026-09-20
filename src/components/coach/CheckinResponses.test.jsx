// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import CheckinResponses from './CheckinResponses';

afterEach(cleanup);
const Q = [{ id: 'sleep', type: 'scale', label: 'Sleep?' }, { id: 'hungry', type: 'yesno', label: 'Hungry?' }, { id: 'wins', type: 'text', label: 'Wins?' }];
const r = (id, created_at, sleep, hungry, wins) => ({ id, created_at, questions_snapshot: Q, answers: { sleep, hungry, wins } });

describe('CheckinResponses', () => {
  it('says so when nothing has been submitted', () => {
    render(<CheckinResponses responses={[]} />);
    expect(screen.getByText('No check-ins submitted yet.')).toBeInTheDocument();
  });

  it('shows each answer readably', () => {
    render(<CheckinResponses responses={[r('a', '2026-09-20T01:00:00Z', 8, true, 'Hit my protein')]} />);
    expect(screen.getByText('8/10')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Hit my protein')).toBeInTheDocument();
  });

  it('shows the trend for a scale question once there are two or more answers, oldest first', () => {
    render(<CheckinResponses responses={[r('b', '2026-09-20T01:00:00Z', 8, false, ''), r('a', '2026-09-06T01:00:00Z', 4, true, 'x')]} />);
    expect(screen.getByText('4 → 8')).toBeInTheDocument();
  });

  it('shows no trend line for a single response', () => {
    render(<CheckinResponses responses={[r('a', '2026-09-20T01:00:00Z', 8, false, '')]} />);
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it('renders a text answer as text, not markup, and marks empty answers', () => {
    render(<CheckinResponses responses={[r('a', '2026-09-20T01:00:00Z', 5, false, '<img src=x onerror=alert(1)>'), r('b', '2026-09-13T01:00:00Z', 5, false, '')]} />);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('keeps showing answers to questions that have since been removed from the form (snapshot)', () => {
    render(<CheckinResponses responses={[{ id: 'a', created_at: '2026-09-20T01:00:00Z', questions_snapshot: [{ id: 'old', type: 'text', label: 'A retired question' }], answers: { old: 'still here' } }]} />);
    expect(screen.getByText('A retired question')).toBeInTheDocument();
    expect(screen.getByText('still here')).toBeInTheDocument();
  });
});
