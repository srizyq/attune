import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import { useProfile } from '../hooks/useProfile';
import { useHistory } from '../hooks/useHistory';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { useTheme } from '../hooks/useTheme';
import { todayLocalDate, dateNDaysAgo, dateRange } from '../lib/patterns';
import { computeExpenditureHistory } from '../lib/adaptiveTDEE';
import AppNav from '../components/AppNav';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const ACCENT = '#8fbc8f';
const WATER_BLUE = '#6aabcf';
const AI_PURPLE = '#9f97e8';

// computeExpenditureHistory needs a 21-day window of history *before* its
// first plotted point (see lib/adaptiveTDEE.js), so a "1 month" display
// range has to fetch 1 month + 21 days of underlying weight/food data —
// otherwise the chart would only ever show the last ~9 days of a
// 30-day range instead of the full month.
const WINDOW_BUFFER_DAYS = 21;

const RANGES = [
  { id: '1m', label: '1M', days: 30, pro: false },
  { id: '3m', label: '3M', days: 90, pro: false },
  { id: '6m', label: '6M', days: 180, pro: true },
  { id: '1y', label: '1Y', days: 365, pro: true },
  { id: 'all', label: 'All', days: 1825, pro: true },
];

function avg(arr) {
  return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
}

export default function Expenditure() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { theme } = useTheme();
  const isPremium = !!profile?.is_premium;
  const [rangeId, setRangeId] = useState('1m');

  const range = RANGES.find(r => r.id === rangeId) || RANGES[0];
  const today = todayLocalDate();
  const fetchStart = dateNDaysAgo(range.days + WINDOW_BUFFER_DAYS - 1);
  const displayStart = dateNDaysAgo(range.days - 1);

  const { logs: weightLogs, loading: weightLoading } = useWeightLogs(fetchStart, today);
  const { dailyData, loading: dailyLoading } = useHistory(fetchStart, today);

  const loading = weightLoading || dailyLoading;

  const fullHistory = useMemo(
    () => computeExpenditureHistory(weightLogs, dailyData.map(d => ({ date: d.date, calories: d.calories }))),
    [weightLogs, dailyData]
  );
  // The computation needs the buffer days to seed its rolling window, but
  // only the actual selected range should ever be plotted or averaged.
  const displayHistory = useMemo(
    () => fullHistory.filter(p => p.date >= displayStart),
    [fullHistory, displayStart]
  );

  const loggedDaysInRange = useMemo(
    () => dailyData.filter(d => d.date >= displayStart && d.calories > 0),
    [dailyData, displayStart]
  );
  const avgIntake = avg(loggedDaysInRange.map(d => d.calories));
  const avgExpenditure = avg(displayHistory.map(p => p.tdee));
  const difference = Math.round(avgExpenditure - avgIntake);
  const hasEnoughData = displayHistory.length > 1 && loggedDaysInRange.length > 0;

  const isLight = theme === 'light';
  const chartTextMuted = isLight ? '#6b6b6b' : '#666666';
  const chartGrid = isLight ? '#e7e7e5' : '#2a2a2a';

  // Moved here from Progress.jsx — "what you actually ate" charts, gated
  // on just having *any* logged days (loggedDaysInRange, already computed
  // above), independent of hasEnoughData's 21-day TDEE requirement so
  // they don't disappear just because the expenditure trend can't be
  // computed yet.
  const allDisplayDates = useMemo(() => dateRange(displayStart, today), [displayStart, today]);
  const filledDays = useMemo(() => {
    const byDate = new Map(dailyData.map(d => [d.date, d]));
    return allDisplayDates.map(date => byDate.get(date) || { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  }, [allDisplayDates, dailyData]);
  const dayLabels = filledDays.map(d => new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }));
  const calorieTarget = profile?.calorie_target || null;

  const calorieChartData = {
    labels: dayLabels,
    datasets: [
      {
        label: 'Calories',
        data: filledDays.map(d => d.calories || null),
        borderColor: ACCENT,
        backgroundColor: ACCENT + '22',
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointRadius: filledDays.length > 30 ? 0 : 3,
      },
      ...(calorieTarget ? [{
        label: 'Goal',
        data: filledDays.map(() => calorieTarget),
        borderColor: chartTextMuted,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false,
      }] : []),
    ],
  };

  const macroChartData = {
    labels: dayLabels,
    datasets: [
      { label: 'Protein', data: filledDays.map(d => d.protein_g || 0), backgroundColor: ACCENT },
      { label: 'Carbs', data: filledDays.map(d => d.carbs_g || 0), backgroundColor: WATER_BLUE },
      { label: 'Fat', data: filledDays.map(d => d.fat_g || 0), backgroundColor: AI_PURPLE },
    ],
  };

  const chartOptionsWithLegend = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: chartTextMuted, boxWidth: 10, font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: chartTextMuted, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTextMuted, font: { size: 10 } }, grid: { color: chartGrid } },
    },
  };
  const stackedOptions = {
    ...chartOptionsWithLegend,
    scales: {
      x: { ...chartOptionsWithLegend.scales.x, stacked: true },
      y: { ...chartOptionsWithLegend.scales.y, stacked: true },
    },
  };

  const chartData = {
    labels: displayHistory.map(p => new Date(p.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })),
    datasets: [{
      label: 'Estimated expenditure',
      data: displayHistory.map(p => p.tdee),
      borderColor: AI_PURPLE,
      backgroundColor: AI_PURPLE + '22',
      fill: true,
      tension: 0.3,
      pointRadius: displayHistory.length > 20 ? 0 : 3,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: chartTextMuted, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTextMuted, font: { size: 10 } }, grid: { color: chartGrid } },
    },
  };

  const startLabel = new Date(displayStart + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const endLabel = new Date(today + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav initials={(profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A'} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, display: 'flex' }}>
            <i className="ti ti-arrow-left" />
          </button>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16 }}>Expenditure</span>
        </div>

        <div className="page-pad" style={{ maxWidth: 700 }}>
          {loading ? null : !hasEnoughData ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 12 }}>
              <i className="ti ti-chart-line" style={{ fontSize: 32, color: 'var(--text-hint)', display: 'block', marginBottom: 10 }} />
              Log weight and food consistently for a couple of weeks to see your expenditure trend here.
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 32, marginBottom: 4 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Average</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {Math.round(avgExpenditure).toLocaleString()}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}> kcal</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Difference</div>
                  <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {difference > 0 ? '+' : ''}{difference.toLocaleString()}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}> kcal</span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 20 }}>{startLabel} – {endLabel}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                Difference is expenditure minus what you actually ate — positive means you ran a deficit, negative means a surplus.
              </div>

              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ height: 240 }}><Line data={chartData} options={chartOptions} /></div>
              </div>
            </>
          )}

          {!loading && loggedDaysInRange.length > 0 && (
            <>
              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Calories vs goal</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Daily intake over this range</div>
                <div style={{ height: 200 }}><Line data={calorieChartData} options={chartOptionsWithLegend} /></div>
              </div>

              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Macro breakdown</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Protein, carbs &amp; fat per day</div>
                <div style={{ height: 200 }}><Bar data={macroChartData} options={stackedOptions} /></div>
              </div>
            </>
          )}

          {/* No real data source yet — Apple Health / Health Connect are
              native-only APIs. Real "calories burned" would sit right
              here alongside the estimate above, since it's the one input
              that could actually validate or refine this exact TDEE
              calculation instead of inferring it purely from weight
              and intake changes. */}
          <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)', fontSize: 18, flexShrink: 0 }}>
              <i className="ti ti-flame" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Real calories burned — coming soon</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Once connected to Apple Health or Google Fit, actual burned calories will show here alongside the estimate above.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RANGES.map(r => {
              const locked = r.pro && !isPremium;
              const active = rangeId === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => locked ? navigate('/settings') : setRangeId(r.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '8px 16px', borderRadius: 20,
                    border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-default)'}`,
                    background: active ? 'var(--accent-bg)' : 'var(--bg-subtle)',
                    color: active ? 'var(--accent)' : locked ? 'var(--text-hint)' : 'var(--text-muted)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {r.label}
                  {locked && <i className="ti ti-lock" style={{ fontSize: 11 }} />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
