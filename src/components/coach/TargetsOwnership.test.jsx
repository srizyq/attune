// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'coach-1' } }) }));
import TargetsOwnership from './TargetsOwnership';

afterEach(cleanup);
const client = (over = {}) => ({ name: 'Maya Patel', targets_set_by: null, targets_set_at: null, targets_overridden_at: null, ...over });

describe('TargetsOwnership', () => {
  it('tells the coach the numbers are theirs and that they will hear about changes', () => {
    render(<TargetsOwnership clientData={client({ targets_set_by: 'coach-1', targets_set_at: '2026-10-12T02:00:00Z' })} />);
    expect(screen.getByTestId('targets-owner')).toHaveTextContent(/Set by you on .*Maya can't change them without taking them over — you'll be told/);
  });

  it('says so when a teammate set them', () => {
    render(<TargetsOwnership clientData={client({ targets_set_by: 'coach-2' })} />);
    expect(screen.getByTestId('targets-owner')).toHaveTextContent('Set by a coach on their team');
  });

  it('warns the coach when the client has taken the numbers over', () => {
    render(<TargetsOwnership clientData={client({ targets_overridden_at: '2026-10-14T05:00:00Z' })} />);
    expect(screen.getByRole('status')).toHaveTextContent(/Maya took these over from you on .*Save targets again to set them back/);
  });

  it('says nothing for a client whose targets nobody has set through Coach Mode', () => {
    const { container } = render(<TargetsOwnership clientData={client()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('falls back to a neutral name', () => {
    render(<TargetsOwnership clientData={client({ name: '', targets_overridden_at: '2026-10-14T05:00:00Z' })} />);
    expect(screen.getByRole('status')).toHaveTextContent('The client took these over from you');
  });
});
