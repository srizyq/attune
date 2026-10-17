// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({ exportMyData: vi.fn() }));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('../../lib/dataExport', () => ({ exportMyData: (...a) => h.exportMyData(...a), exportFilename: () => 'attune-data-export-2026-10-16.json' }));
import PrivacyModal from './PrivacyModal';

let clicked;
beforeEach(() => {
  clicked = [];
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked.push(this.download); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const open = () => render(<MemoryRouter><PrivacyModal onClose={() => {}} /></MemoryRouter>);

describe('Privacy → Export my data', () => {
  it('downloads the whole export under a dated name', async () => {
    h.exportMyData.mockResolvedValue({ skipped: [], included: ['Food log'] });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    await waitFor(() => expect(clicked).toEqual(['attune-data-export-2026-10-16.json']));
    expect(h.exportMyData).toHaveBeenCalledWith('u1');
    expect(await screen.findByRole('button', { name: 'Downloaded ✓' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('tells the person what was left out, rather than letting them think the file is complete', async () => {
    h.exportMyData.mockResolvedValue({ skipped: [{ section: 'Workouts', reason: 'permission denied' }], included: [] });
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Left out because they couldn\'t be read: Workouts (permission denied)');
    expect(clicked).toHaveLength(1); // the rest was still downloaded
  });

  it('says so when the export fails outright', async () => {
    h.exportMyData.mockRejectedValue(new Error('offline'));
    open();
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(clicked).toHaveLength(0);
  });
});
