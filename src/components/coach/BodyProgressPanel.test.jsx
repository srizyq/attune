// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const state = {};
vi.mock('../../hooks/useBodyProgress', () => ({ useBodyMeasurements: (id) => { state.idM = id; return state.m; }, useProgressPhotos: (id) => { state.idP = id; return state.p; } }));
import BodyProgressPanel from './BodyProgressPanel';

afterEach(cleanup);
const setup = ({ m = {}, p = {} } = {}) => {
  state.m = { rows: [], supported: true, ...m };
  state.p = { photos: [], urls: {}, supported: true, ...p };
  return render(<BodyProgressPanel client={{ id: 'c1' }} />);
};

describe('BodyProgressPanel (coach view)', () => {
  it('reads the connected client\'s data, not the coach\'s own', () => {
    setup();
    expect(state.idM).toBe('c1');
    expect(state.idP).toBe('c1');
  });
  it('is read-only: no inputs, no add or delete', () => {
    setup({ p: { photos: [{ id: 'p', taken_date: '2026-09-20', path: 'c1/a.jpg', note: null }], urls: { 'c1/a.jpg': 'https://x.test/a' } } });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add a progress photo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
  it('shows latest values, entry counts and change since the previous reading', () => {
    setup({ m: { rows: [
      { kind: 'hips', logged_date: '2026-09-20', value: 96, unit: 'cm' },
      { kind: 'hips', logged_date: '2026-09-10', value: 98, unit: 'cm' },
      { kind: 'body_fat', logged_date: '2026-09-20', value: 19, unit: 'pct' },
    ] } });
    expect(screen.getByText('96 cm')).toBeInTheDocument();
    expect(screen.getByText(/2 entries/)).toBeInTheDocument();
    expect(screen.getByText(/−2 since previous/)).toBeInTheDocument();
    expect(screen.getByText('19%')).toBeInTheDocument();
    expect(screen.getByText(/1 entry/)).toBeInTheDocument();
  });
  it('says so when there is nothing logged', () => {
    setup();
    expect(screen.getByText('No measurements logged.')).toBeInTheDocument();
    expect(screen.getByText('No progress photos.')).toBeInTheDocument();
  });
  it('renders nothing before the database update is applied', () => {
    const { container } = setup({ m: { supported: false }, p: { supported: false } });
    expect(container).toBeEmptyDOMElement();
  });
});
