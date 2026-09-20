import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { useProfile } from '../hooks/useProfile';
import { useHistory } from '../hooks/useHistory';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { useTheme } from '../hooks/useTheme';
import { todayLocalDate, dateNDaysAgo, dateRange, streakFor, computeStreak } from '../lib/patterns';
import { computeExpenditureHistory, computeTrendWeight, toKg, fromKg } from '../lib/adaptiveTDEE';
import AppNav from '../components/AppNav';
import CoachNote from '../components/CoachNote';
import { useCoachNote } from '../hooks/useCoach';
import LogCalendar from '../components/LogCalendar';
import BodyProgressCard from '../components/BodyProgressCard';
import StreakItem from '../components/StreakItem';
import DayHeatmapStrip from '../components/DayHeatmapStrip';
import MacroSplitBar from '../components/MacroSplitBar';
import { targetsForDate, dayTargetsActive } from '../lib/dayTargets';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

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

const WEIGHT_RANGES = [
  { id: '7d', label: '1 week', days: 7 },
  { id: '30d', label: '1 month', days: 30 },
  { id: '90d', label: '3 months', days: 90 },
  { id: '365d', label: '1 year', days: 365 },
  { id: '5y', label: '5 years', days: 1825 },
  { id: 'all', label: 'All time', days: null },
];

// Theme-invariant accents — identical hex in both themes by design.
const ACCENT = '#8fbc8f';
const WATER_BLUE = '#6aabcf';
const AI_PURPLE = '#9f97e8';

function avg(arr) {
  return arr.length ? arr.reduce((s, n) => s + n, 0) / arr.length : 0;
}

// ── stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, hint }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)',
      borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: value === '—' ? 'var(--text-hint)' : 'var(--text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{hint}</div>
    </div>
  );
}

function EmptyChartBox({ icon, message }) {
  return (
    <div style={{
      height: 180, border: '1px dashed var(--border-strong)', borderRadius: 8,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: 'var(--text-hint)' }} />
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 200 }}>{message}</div>
    </div>
  );
}

// Week-at-a-glance bars — a fixed last-7-days view regardless of the page's
// own range picker, same as Dashboard's own week view.
function WeekBars({ days, calorieTarget, targetFor }) {
  // A rest day can have its own target, so each bar is judged against its own day's.
  const targetOf = (d) => (targetFor ? targetFor(d.date) : calorieTarget);
  const max = Math.max(...days.map(d => targetOf(d) || 0), ...days.map(d => d.calories), 1);
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 100 }}>
        {days.map((d) => {
          const pct = Math.max(4, (d.calories / max) * 100);
          const dayTarget = targetOf(d);
          const onTarget = dayTarget && d.calories > 0 && Math.abs(d.calories - dayTarget) <= dayTarget * 0.15;
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: 100 }}>
              <div style={{
                width: '100%', height: `${pct}%`, borderRadius: '4px 4px 0 0',
                background: d.calories === 0 ? 'var(--border-default)' : onTarget ? '#8fbc8f' : '#6aabcf',
                transition: 'height 0.5s ease',
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
        {days.map((d) => (
          <div key={d.date} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)' }}>
            {new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' })}
          </div>
        ))}
      </div>
    </div>
  );
}

// The dashboard's weight tile also has its own quick-log popup
// (WeightLogModal in Dashboard.jsx) for logging without leaving that
// page — this button is the equivalent entry point for anyone already
// on this page instead.
function LogWeightButton({ unit, onLog }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!value || saving) return;
    setSaving(true);
    try {
      await onLog(Number(value), unit);
      setValue('');
      setOpen(false);
    } catch (err) {
      console.error('Failed to log weight:', err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        + Log weight
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="number" autoFocus value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }}
        placeholder={`Weight (${unit})`}
        style={{ width: 110, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '6px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
      />
      <button onClick={submit} disabled={!value || saving} style={{ background: !value || saving ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 600, color: !value || saving ? 'var(--text-muted)' : '#0f0f0f', cursor: !value || saving ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 12, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
    </div>
  );
}

export default function Expenditure() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const { theme } = useTheme();
  const { note: weightCoachNote, dismiss: dismissWeightCoachNote } = useCoachNote('weight');
  const isPremium = !!profile?.is_premium;
  const [rangeId, setRangeId] = useState('1m');
  const [weightRange, setWeightRange] = useState('30d');

  const range = RANGES.find(r => r.id === rangeId) || RANGES[0];
  const today = todayLocalDate();
  const fetchStart = dateNDaysAgo(range.days + WINDOW_BUFFER_DAYS - 1);
  const displayStart = dateNDaysAgo(range.days - 1);

  // Dashboard's weight tile deep-links here instead of dropping the user
  // at the top of a long page — scrolls the weight chart into view once
  // on arrival rather than requiring them to scroll down to find it.
  const weightSectionRef = useRef(null);
  useEffect(() => {
    if (location.state?.scrollTo !== 'weight') return;
    // This page's stat cards, calendar, heatmaps, and the weight chart
    // itself all resolve from independent async hooks that don't settle
    // in lockstep — one smooth scroll for a nice first move, then correct
    // with instant scrolls every 150ms for ~2.5s so the view keeps
    // tracking the target as the layout above it settles.
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 16;
    const tick = () => {
      if (cancelled) return;
      weightSectionRef.current?.scrollIntoView({ behavior: attempts === 0 ? 'smooth' : 'auto', block: 'start' });
      attempts++;
      if (attempts < maxAttempts) setTimeout(tick, 150);
    };
    tick();
    return () => { cancelled = true; };
  }, [location.state]);

  const { logs: weightLogs, loading: weightLoading } = useWeightLogs(fetchStart, today);
  const { dailyData, loading: dailyLoading } = useHistory(fetchStart, today);
  // Streaks always look back a fixed 59 days regardless of the range
  // picker above — a shorter selected range shouldn't shrink someone's
  // visible streak length.
  const { dailyData: badgeData } = useHistory(dateNDaysAgo(59), today);
  // Weight chart browses its own range independently of the TDEE/calorie
  // range above (someone might want "All time" weight next to a "1M" TDEE
  // trend), so it gets its own fetch scoped to WEIGHT_RANGES instead of
  // reusing the buffered fetch above.
  const weightRangeDays = WEIGHT_RANGES.find(r => r.id === weightRange)?.days;
  const { logs: chartWeightLogs, loading: chartWeightLoading, logWeight } = useWeightLogs(
    weightRangeDays ? dateNDaysAgo(weightRangeDays - 1) : null,
    today
  );

  // Calendar browses independently of the range picker too, scoped to
  // whatever month is currently shown.
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const calMonthStart = todayLocalDate(calMonth);
  const calMonthEnd = todayLocalDate(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
  const { dailyData: calData, loading: calLoading } = useHistory(calMonthStart, calMonthEnd);
  const calByDate = useMemo(() => new Map(calData.map(d => [d.date, d])), [calData]);
  const canGoNextMonth = calMonthStart < todayLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const loading = weightLoading || dailyLoading;
  const weightUnit = profile?.unit === 'imperial' ? 'lb' : 'kg';
  const calorieTarget = profile?.calorie_target || null;
  const proteinTarget = profile?.protein_g || null;
  // What applies on a given day — a rest day may have its own targets (see
  // lib/dayTargets.js). With none set this is just the everyday target.
  const restTargets = dayTargetsActive(profile) ? profile.rest_day_targets : null;
  const hasCalorieTarget = !!(calorieTarget || restTargets?.calories);
  const hasProteinTarget = !!(proteinTarget || restTargets?.protein_g);
  const calorieTargetFor = (date) => targetsForDate(profile, date).calories || null;
  const onCalorieTarget = (d, tolerance) => {
    const t = calorieTargetFor(d.date);
    return !!t && Math.abs(d.calories - t) <= t * tolerance;
  };

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

  const allDisplayDates = useMemo(() => dateRange(displayStart, today), [displayStart, today]);
  const filledDays = useMemo(() => {
    const byDate = new Map(dailyData.map(d => [d.date, d]));
    return allDisplayDates.map(date => byDate.get(date) || { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, energy: null, mood: null });
  }, [allDisplayDates, dailyData]);
  const filledByDate = useMemo(() => new Map(filledDays.map(d => [d.date, d])), [filledDays]);
  const loggedDaysInRange = useMemo(
    () => filledDays.filter(d => d.calories > 0),
    [filledDays]
  );
  const hasAnyLogs = loggedDaysInRange.length > 0;
  const avgIntake = avg(loggedDaysInRange.map(d => d.calories));
  const avgExpenditure = avg(displayHistory.map(p => p.tdee));
  const difference = Math.round(avgExpenditure - avgIntake);
  const hasEnoughData = displayHistory.length > 1 && hasAnyLogs;

  const avgCalories = Math.round(avg(loggedDaysInRange.map(d => d.calories)));
  const avgProtein = Math.round(avg(loggedDaysInRange.map(d => d.protein_g)));
  const daysOnTarget = hasCalorieTarget
    ? loggedDaysInRange.filter(d => onCalorieTarget(d, 0.1)).length
    : 0;
  const energyDays = filledDays.filter(d => d.energy != null);
  const avgEnergy = energyDays.length ? (avg(energyDays.map(d => d.energy))).toFixed(1) : null;

  const loggingStreak = computeStreak(badgeData);
  const calorieStreak = hasCalorieTarget
    ? streakFor(badgeData, d => d.calories > 0 && onCalorieTarget(d, 0.15))
    : 0;
  const moodStreak = streakFor(badgeData, d => d.mood != null);
  const proteinStreak = hasProteinTarget
    ? streakFor(badgeData, d => { const t = targetsForDate(profile, d.date).protein_g; return !!t && d.protein_g >= t * 0.9; })
    : 0;

  // Heatmap cells for "calories vs goal" — pct is share of the calorie
  // target (capped at 100, since the point is progress toward the goal,
  // not how far over it a day went); null (no cell fill) on a day with
  // nothing logged at all, same "no data" treatment LogCalendar uses.
  const calorieHeatmapDays = useMemo(() => filledDays.map(d => {
    const dayTarget = targetsForDate(profile, d.date).calories;
    const pct = !d.calories ? null : dayTarget ? Math.min(100, Math.round((d.calories / dayTarget) * 100)) : 100;
    return {
      date: d.date,
      pct,
      tooltip: `${new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}: ${d.calories ? `${Math.round(d.calories)} kcal` : 'nothing logged'}`,
    };
  }), [filledDays, profile]);

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
  const avgMacroProtein = avg(loggedDaysInRange.map(d => d.protein_g || 0));
  const avgMacroCarbs = avg(loggedDaysInRange.map(d => d.carbs_g || 0));
  const avgMacroFat = avg(loggedDaysInRange.map(d => d.fat_g || 0));

  const startLabel = new Date(displayStart + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  const endLabel = new Date(today + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

  // Chart.js draws to <canvas>, which can't resolve CSS custom
  // properties — it needs a literal color string at render time.
  const isLight = theme === 'light';
  const chartTextMuted = isLight ? '#6b6b6b' : '#666666';
  const chartGrid = isLight ? '#e7e7e5' : '#2a2a2a';

  const trendPoints = useMemo(() => computeTrendWeight(chartWeightLogs), [chartWeightLogs]);
  const trendByDate = useMemo(() => new Map(trendPoints.map(p => [p.date, p.trend])), [trendPoints]);
  const weightLabels = chartWeightLogs.map(w => new Date(w.logged_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', ...(weightRangeDays > 365 ? { year: '2-digit' } : {}) }));
  const weightChartData = {
    labels: weightLabels,
    datasets: [
      {
        label: 'Weight',
        data: chartWeightLogs.map(w => Math.round(fromKg(toKg(w.weight, w.unit), weightUnit) * 10) / 10),
        borderColor: ACCENT,
        backgroundColor: ACCENT + '22',
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointRadius: chartWeightLogs.length > 60 ? 0 : 3,
      },
      {
        label: 'Trend',
        data: chartWeightLogs.map(w => {
          const t = trendByDate.get(w.logged_date);
          return t != null ? Math.round(fromKg(t, weightUnit) * 10) / 10 : null;
        }),
        borderColor: WATER_BLUE,
        backgroundColor: 'transparent',
        fill: false,
        tension: 0.3,
        spanGaps: true,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };
  const weightChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: chartTextMuted, boxWidth: 10, font: { size: 11 } } },
    },
    scales: {
      x: { ticks: { color: chartTextMuted, font: { size: 10 }, maxTicksLimit: 8 }, grid: { color: chartGrid } },
      y: { ticks: { color: chartTextMuted, font: { size: 10 } }, grid: { color: chartGrid } },
    },
  };

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

        <div className="page-pad" style={{ maxWidth: 900 }}>

          {!loading && !hasAnyLogs && (
            <div className="empty-state-row" style={{
              background: 'var(--accent-bg)', border: '1px solid var(--border-active)',
              borderRadius: 12, padding: '28px 32px', marginBottom: 24,
            }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                  Nothing to show yet in this range
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 420, lineHeight: 1.6 }}>
                  Start logging meals and check in on mood in the dashboard — your charts, streaks, and trends will appear here as your data builds up.
                </div>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  background: 'var(--accent)', border: 'none', borderRadius: 8,
                  padding: '10px 22px', fontSize: 14, fontWeight: 600,
                  color: '#0f0f0f', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}
              >
                Go to dashboard
              </button>
            </div>
          )}

          {/* range toggle */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
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

          {/* average / difference + expenditure trend */}
          {loading ? null : !hasEnoughData ? (
            hasAnyLogs && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 12, marginBottom: 20 }}>
                <i className="ti ti-chart-line" style={{ fontSize: 32, color: 'var(--text-hint)', display: 'block', marginBottom: 10 }} />
                Log weight and food consistently for a couple of weeks to see your expenditure trend here.
              </div>
            )
          ) : (
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
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
              <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 16 }}>{startLabel} – {endLabel}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Difference is expenditure minus what you actually ate — positive means you ran a deficit, negative means a surplus.
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Expenditure trend</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Darker = higher estimated burn that day</div>
              <DayHeatmapStrip days={tdeeHeatmapDays} color={AI_PURPLE} />
            </div>
          )}

          {/* calories vs goal + macro breakdown */}
          {!loading && hasAnyLogs && (
            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Calories vs goal</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Darker = closer to your calorie target that day</div>
                <DayHeatmapStrip days={calorieHeatmapDays} color={ACCENT} />
              </div>

              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Macro breakdown</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Average split over this range</div>
                <MacroSplitBar protein={avgMacroProtein} carbs={avgMacroCarbs} fat={avgMacroFat} />
              </div>
            </div>
          )}

          {/* stat cards */}
          <div className="grid-4" style={{ marginBottom: 20 }}>
            <StatCard label="Avg. calories" value={hasAnyLogs ? avgCalories.toLocaleString() : '—'} hint={hasAnyLogs ? `over ${loggedDaysInRange.length} logged days` : 'No data yet'} />
            <StatCard label="Days on target" value={hasAnyLogs && hasCalorieTarget ? daysOnTarget : '—'} hint={hasCalorieTarget ? (restTargets ? "within 10% of each day's goal" : 'within 10% of goal') : 'Set a calorie target in Settings'} />
            <StatCard label="Avg. protein" value={hasAnyLogs ? `${avgProtein}g` : '—'} hint={hasAnyLogs ? `over ${loggedDaysInRange.length} logged days` : 'No data yet'} />
            <StatCard label="Avg. energy" value={avgEnergy || '—'} hint={avgEnergy ? `over ${energyDays.length} check-ins` : 'Check in on mood to unlock this'} />
          </div>

          {/* No real data source yet — Apple Health / Health Connect are
              native-only APIs. Real "calories burned" would sit right
              here alongside the estimate above, since it's the one input
              that could actually validate or refine this exact TDEE
              calculation instead of inferring it purely from weight
              and intake changes. */}
          <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--border-default)', borderRadius: 12, padding: 20, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-hint)', fontSize: 18, flexShrink: 0 }}>
              <i className="ti ti-flame" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 2 }}>Real calories burned — coming soon</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Once connected to Apple Health or Google Fit, actual burned calories will show here alongside the estimate above.</div>
            </div>
          </div>

          {/* calendar */}
          <div style={{ marginBottom: 24 }}>
            <LogCalendar
              month={calMonth}
              byDate={calByDate}
              calorieTarget={calorieTargetFor}
              loading={calLoading}
              onPrevMonth={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              onNextMonth={() => canGoNextMonth && setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              canGoNext={canGoNextMonth}
              onSelectDay={(date) => navigate('/dashboard', { state: { date } })}
            />
          </div>

          {/* weight chart */}
          <div ref={weightSectionRef} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Weight</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <LogWeightButton unit={weightUnit} onLog={(w, u) => logWeight(today, w, u)} />
              <select
                value={weightRange}
                onChange={e => setWeightRange(e.target.value)}
                style={{
                  background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                  borderRadius: 7, padding: '7px 10px', fontSize: 12, color: 'var(--text-primary)',
                  fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none', cursor: 'pointer',
                }}
              >
                {WEIGHT_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {weightCoachNote && <CoachNote note={weightCoachNote} onDismiss={dismissWeightCoachNote} style={{ marginBottom: 16 }} />}
            {chartWeightLoading ? null : chartWeightLogs.length > 1 ? (
              <div style={{ height: 220 }}><Line data={weightChartData} options={weightChartOptions} /></div>
            ) : (
              <EmptyChartBox icon="ti-scale" message="Log your weight above to see a trend here" />
            )}
          </div>

          {/* body measurements + progress photos */}
          <BodyProgressCard />

          {/* streaks + week-at-a-glance */}
          <div className="grid-2">
            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 16 }}>Streak badges</div>
              {[
                { icon: 'ti-flame',      iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)',     name: 'Logging streak',   count: loggingStreak },
                { icon: 'ti-target',     iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)',     name: 'Calorie target',   count: calorieStreak },
                { icon: 'ti-meat',       iconBg: WATER_BLUE + '18',  iconColor: 'var(--water-blue)', name: 'Protein target',   count: proteinStreak },
                { icon: 'ti-mood-smile', iconBg: AI_PURPLE + '18',   iconColor: 'var(--ai-purple)',  name: 'Mood check-ins',   count: moodStreak },
              ].map((s, i, arr) => (
                <div key={s.name} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                  <StreakItem {...s} />
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 20 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>This week at a glance</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Calories logged each day</div>
              <WeekBars days={dateRange(dateNDaysAgo(6), today).map(date => filledByDate.get(date) || { date, calories: 0 })} calorieTarget={calorieTarget} targetFor={calorieTargetFor} />
              <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Green = within 15% of your target. Blue = logged but off target. Grey = nothing logged.
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
