import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useHistory } from '../hooks/useHistory';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { todayLocalDate, dateNDaysAgo, dateRange } from '../lib/patterns';
import { computeExpenditureHistory } from '../lib/adaptiveTDEE';
import AppNav from '../components/AppNav';
import DayHeatmapStrip from '../components/DayHeatmapStrip';
import MacroSplitBar from '../components/MacroSplitBar';

const ACCENT = '#8fbc8f';
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

  // Moved here from Progress.jsx — "what you actually ate", gated on just
  // having *any* logged days (loggedDaysInRange, already computed above),
  // independent of hasEnoughData's 21-day TDEE requirement so it doesn't
  // disappear just because the expenditure trend can't be computed yet.
  const allDisplayDates = useMemo(() => dateRange(displayStart, today), [displayStart, today]);
  const filledDays = useMemo(() => {
    const byDate = new Map(dailyData.map(d => [d.date, d]));
    return allDisplayDates.map(date => byDate.get(date) || { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  }, [allDisplayDates, dailyData]);
  const calorieTarget = profile?.calorie_target || null;

  // Heatmap cells for "calories vs goal" — pct is share of the calorie
  // target (capped at 100, since the point is progress toward the goal,
  // not how far over it a day went); null (no cell fill) on a day with
  // nothing logged at all, same "no data" treatment LogCalendar uses.
  const calorieHeatmapDays = useMemo(() => filledDays.map(d => {
    const pct = !d.calories ? null : calorieTarget ? Math.min(100, Math.round((d.calories / calorieTarget) * 100)) : 100;
    return {
      date: d.date,
      pct,
      tooltip: `${new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}: ${d.calories ? `${Math.round(d.calories)} kcal` : 'nothing logged'}`,
    };
  }), [filledDays, calorieTarget]);

  // Heatmap cells for the expenditure trend — pct is this day's TDEE
  // normalized against the range's own min/max, since TDEE has no fixed
  // "goal" the way calories does.
  const tdeeHeatmapDays = useMemo(() => {
    const values = displayHistory.map(p => p.tdee);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    return displayHistory.map(p => ({
      date: p.date,
      pct: Math.round(((p.tdee - min) / span) * 100),
      tooltip: `${new Date(p.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}: ${Math.round(p.tdee).toLocaleString()} kcal`,
    }));
  }, [displayHistory]);

  // Macro breakdown — a single averaged split across the range instead of
  // per-day bars, since the range's overall balance (not any one day) is
  // what this section is actually trying to answer.
  const avgProtein = avg(loggedDaysInRange.map(d => d.protein_g || 0));
  const avgCarbs = avg(loggedDaysInRange.map(d => d.carbs_g || 0));
  const avgFat = avg(loggedDaysInRange.map(d => d.fat_g || 0));

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
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Expenditure trend</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Darker = higher estimated burn that day</div>
                <DayHeatmapStrip days={tdeeHeatmapDays} color={AI_PURPLE} />
              </div>
            </>
          )}

          {!loading && loggedDaysInRange.length > 0 && (
            <>
              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Calories vs goal</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Darker = closer to your calorie target that day</div>
                <DayHeatmapStrip days={calorieHeatmapDays} color={ACCENT} />
              </div>

              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Macro breakdown</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Average split over this range</div>
                <MacroSplitBar protein={avgProtein} carbs={avgCarbs} fat={avgFat} />
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
