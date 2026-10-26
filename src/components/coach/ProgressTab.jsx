import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card, SectionLabel, EmptyChartBox, RangeToggle } from './shared';
import WorkoutsCard from './WorkoutsCard';
import BodyProgressPanel from './BodyProgressPanel';
import ReportsTab from './ReportsTab';
import { RANGES } from './constants';
import { dateNDaysAgo } from '../../lib/patterns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// Body and training over the selected range: weight trend and workouts.
export default function ProgressTab({ client, clientData, d, reportsOpen = false, onReportsOpenChange }) {
  const { latestWeight, weightLoading, weightLogs, weightChartData, chartOptions } = d;
  const since = dateNDaysAgo(d.range - 1);
  const rangeWorkouts = d.workouts.filter(w => w.date >= since);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <RangeToggle value={d.range} onChange={d.setRange} options={RANGES} />
      </div>
      <Card>
        <SectionLabel icon="ti-scale">Weight</SectionLabel>
        <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 12 }}>
          {latestWeight ? `${latestWeight.weight}${latestWeight.unit}` : '—'}
        </div>
        {weightLoading ? null : weightLogs.length > 1 ? (
          <div style={{ height: 200 }}><Line data={weightChartData} options={chartOptions} /></div>
        ) : (
          <EmptyChartBox icon="ti-scale" message="Not enough weight entries in this range" />
        )}
      </Card>

      <BodyProgressPanel client={client} />

      <WorkoutsCard title={`Workouts \u2014 last ${d.range} days`} workouts={rangeWorkouts} loading={d.workoutsLoading} showDate />

      {/* The report builder: a printable/CSV summary for a client's file. Used now
          and then, so it's a row until it's wanted instead of a tab of its own. */}
      {reportsOpen ? (
        <div id="client-report-builder">
          <ReportsTab client={client} clientData={clientData} />
          <button type="button" onClick={() => onReportsOpenChange?.(false)} className="btn-press" style={{ minHeight: 44, padding: '0 4px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Hide report builder</button>
        </div>
      ) : (
        <Card style={{ marginBottom: 0, padding: 0 }}>
          <button type="button" onClick={() => onReportsOpenChange?.(true)} aria-expanded="false" className="btn-press" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 56, padding: '0 20px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><i className="ti ti-file-analytics" aria-hidden="true" style={{ color: 'var(--text-muted)' }} />Export a report</span>
            <i className="ti ti-chevron-right" aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
          </button>
        </Card>
      )}
    </div>
  );
}
