// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

vi.mock('react-chartjs-2', () => ({ Line: () => <div>chart</div> }));
vi.mock('./BodyProgressPanel', () => ({ default: () => <div>body-panel</div> }));
vi.mock('./WorkoutsCard', () => ({ default: () => <div>workouts-card</div> }));
vi.mock('./ReportsTab', () => ({ default: () => <div>report-builder</div> }));
import ProgressTab from './ProgressTab';

afterEach(cleanup);
const d = { range: 30, setRange: vi.fn(), latestWeight: { weight: 71.2, unit: 'kg' }, weightLoading: false, weightLogs: [{}, {}], weightChartData: {}, chartOptions: {}, workouts: [], workoutsLoading: false };
const client = { id: 'c1', name: 'Maya' };

describe('ProgressTab', () => {
  it('has the range toggle at the top, governing everything below it', () => {
    render(<ProgressTab client={client} clientData={client} d={d} />);
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('71.2kg')).toBeInTheDocument();
  });

  it('keeps the report builder behind a row until it is wanted', async () => {
    const onReportsOpenChange = vi.fn();
    render(<ProgressTab client={client} clientData={client} d={d} reportsOpen={false} onReportsOpenChange={onReportsOpenChange} />);
    expect(screen.queryByText('report-builder')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /Export a report/ }));
    expect(onReportsOpenChange).toHaveBeenCalledWith(true);
  });

  it('shows the builder when opened, and lets it be hidden again', async () => {
    const onReportsOpenChange = vi.fn();
    render(<ProgressTab client={client} clientData={client} d={d} reportsOpen onReportsOpenChange={onReportsOpenChange} />);
    expect(screen.getByText('report-builder')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export a report/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Hide report builder' }));
    expect(onReportsOpenChange).toHaveBeenCalledWith(false);
  });
});
