import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { Card, SectionLabel, EmptyChartBox, RangeToggle } from './shared';
import WorkoutsCard from './WorkoutsCard';
import BodyProgressPanel from './BodyProgressPanel';
import { RANGES } from './constants';
import { dateNDaysAgo } from '../../lib/patterns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

// Body and training over the selected range: weight trend and workouts.
export default function ProgressTab({ client, d }) {
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
        <div style={{ color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, fontFamily: "'Syne', sans-serif", marginBottom: 12 }}>
          {latestWeight ? `${latestWeight.weight}${latestWeight.unit}` : '—'}
        </div>
        {weightLoading ? null : weightLogs.length > 1 ? (
          <div style={{ height: 200 }}><Line data={weightChartData} options={chartOptions} /></div>
        ) : (
          <EmptyChartBox icon="ti-scale" message="Not enough weight entries in this range" />
        )}
      </Card>

      <BodyProgressPanel client={client} />

      <WorkoutsCard title={`Workouts \u2014 last ${d.range} days`} workouts={rangeWorkouts} loading={d.workoutsLoading} showDate style={{ marginBottom: 0 }} />
    </div>
  );
}
