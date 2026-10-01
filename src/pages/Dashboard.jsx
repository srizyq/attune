// src/pages/Dashboard.jsx
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase, emailRedirectTo } from '../lib/supabase';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { useCheckins } from '../hooks/useCheckins';
import { useHistory } from '../hooks/useHistory';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { useAdaptiveTarget } from '../hooks/useAdaptiveTarget';
import { useWorkoutLogs, useWorkoutLogsRange } from '../hooks/useWorkoutLogs';
import { todayLocalDate, dateNDaysAgo, dateRange, computeStreak } from '../lib/patterns';
import { goalMacroSplits, buildTargets } from '../lib/calorieTargets';
import { toKg, fromKg } from '../lib/adaptiveTDEE';
import { weightInKg, getWorkoutType } from '../lib/workoutMath';
import { useClosingTransition } from '../hooks/useClosingTransition';
import AppNav from '../components/AppNav';
import CoachNote from '../components/CoachNote';
import CoachChatModal from '../components/CoachChatModal';
import LogWorkoutModal from '../components/LogWorkoutModal';
import { useCoachNote } from '../hooks/useCoach';
import LogItemRow from '../components/LogItemRow';
import LogCalendar from '../components/LogCalendar';
import SlotTimeline from '../components/SlotTimeline';
import DailyLogViewToggle from '../components/DailyLogViewToggle';
import SegmentedControl from '../components/SegmentedControl';
import Toast from '../components/Toast';
import { targetLineSegments } from '../lib/chartTarget';
import { targetsForDate } from '../lib/dayTargets';
import YesterdayMealPrompt from '../components/YesterdayMealPrompt';
import { useCopyYesterday } from '../hooks/useCopyYesterday';
import TrialBanner from '../components/TrialBanner';
import { round1 } from '../lib/format';
import FormRow from '../components/FormRow';
import ListRow from '../components/ListRow';
import Card from '../components/Card';
import StatBadge from '../components/StatBadge';

// Accent/water-blue/ai-purple are the same hex in both themes by design.
const ACCENT = 'var(--accent)';
const WATER_BLUE = '#6aabcf';
const AI_PURPLE = '#9f97e8';

// ─── Calorie hero — real weekly/monthly/quarterly trend, no decorative
// elements without real data behind them (no fake "uncertainty band" —
// this is a chart of actual logged calories, not an estimate). ──────────
const CHART_RANGE_OPTIONS = [{ id: '1W', label: '1W' }, { id: '1M', label: '1M' }, { id: '3M', label: '3M' }];

// One tap adds 250ml (one "glass" in the underlying water_glasses count —
// no schema change, this is purely a display/interaction relabel). Holding
// the tile for ~500ms removes the most recent addition instead, since the
// tile is too small to show a row of individually-tappable glasses like
// the old WaterTracker did.
const WATER_ML_PER_GLASS = 250;
const WATER_LONG_PRESS_MS = 500;

function WeightCard({ latest, weightTrendKg, weightUnit, recentWeights, targetWeight, onClick }) {
  const trendDisplay = weightTrendKg == null ? null : round1(fromKg(weightTrendKg, weightUnit));
  const hasSparkline = recentWeights.length >= 2;
  return (
    <button onClick={onClick} style={{ all: 'unset', display: 'block', width: '100%', cursor: 'pointer' }}>
      <Card style={{ padding: '16px 18px', marginBottom: 0, cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>WEIGHT</span>
          {weightTrendKg != null && (
            <StatBadge>{trendDisplay >= 0 ? '+' : ''}{round1(trendDisplay)}</StatBadge>
          )}
        </div>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: hasSparkline ? 10 : 0 }}>
          {latest ? `${latest.weight}${latest.unit}` : '—'}
        </div>
        {hasSparkline && <WeightSparkline points={recentWeights} color="var(--accent)" />}
        {targetWeight != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: hasSparkline ? 8 : 12, paddingTop: hasSparkline ? 8 : 0, borderTop: hasSparkline ? '1px solid var(--border-default)' : 'none' }}>
            <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>Target</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>{round1(targetWeight)} {weightUnit}</span>
          </div>
        )}
      </Card>
    </button>
  );
}

// ─── Weight quick-log modal — tapping the weight tile used to just
// navigate straight to Progress, requiring a page change to log one
// number. That deep-link (scrollTo: 'weight') still exists — it now
// lives inside this modal's "View trend" button — but logging itself no
// longer requires leaving the dashboard at all. Leads with a small trend
// sparkline of recent entries so logging feels like adding one point to
// a story, not filling a bare form.
function WeightSparkline({ points, color }) {
  if (points.length < 2) return null;
  const w = 240, h = 56, pad = 6;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const norm = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const coords = points.map((v, i) => [(i / (points.length - 1)) * w, norm(v)]);
  const linePts = coords.map(p => p.join(',')).join(' ');
  const areaPts = `0,${h} ${linePts} ${w},${h}`;
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: h, display: 'block' }}>
      <polygon points={areaPts} fill={color} opacity="0.08" />
      <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={color} />
    </svg>
  );
}

function WeightLogModal({ weightLogs, latest, unit, onSave, onClose, onViewTrend, closing }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const recent = [...weightLogs]
    .sort((a, b) => a.logged_date.localeCompare(b.logged_date))
    .slice(-10)
    .map(w => round1(fromKg(toKg(w.weight, w.unit), unit)));

  async function submit() {
    if (!value || saving) return;
    setSaving(true);
    try {
      await onSave(Number(value));
      onClose();
    } catch (err) {
      console.error('Failed to log weight:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={onClose} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, width: '100%', maxWidth: 340, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Log weight</span>
          <button className="hit-slop" aria-label="Close" onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>×</button>
        </div>

        {recent.length >= 2 && (
          <div style={{ marginBottom: 16 }}>
            <WeightSparkline points={recent} color="var(--accent)" />
          </div>
        )}

        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Last logged</span>
        </div>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {latest ? `${latest.weight}${latest.unit}` : '—'}
          </span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <FormRow>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder={`Weight (${unit})`}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '11px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
                borderRadius: 10, color: 'var(--text-primary)', fontSize: 15, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none',
              }}
            />
            <FormRow.Button icon="ti-device-floppy" primary onClick={submit} disabled={!value || saving}>
              {saving ? '…' : 'Save'}
            </FormRow.Button>
          </FormRow>
        </div>

        <button
          onClick={onViewTrend}
          style={{ width: '100%', minHeight: 24, background: 'none', border: 'none', color: 'var(--accent-dark)', fontSize: 13, cursor: 'pointer', padding: '6px 0', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          View trend →
        </button>
      </div>
    </div>
  );
}

const WATER_SEGMENTS = 5;

function WaterCard({ glasses, targetGlasses, setGlasses }) {
  const pressTimer = useRef(null);
  const longPressFired = useRef(false);

  function handlePointerDown(e) {
    e.stopPropagation();
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setGlasses(Math.max(0, glasses - 1));
    }, WATER_LONG_PRESS_MS);
  }
  function clearPressTimer() {
    clearTimeout(pressTimer.current);
  }
  function handlePointerUp(e) {
    e.stopPropagation();
    clearPressTimer();
    if (longPressFired.current) { longPressFired.current = false; return; }
    setGlasses(glasses + 1);
  }

  const targetMl = targetGlasses * WATER_ML_PER_GLASS;
  const filledSegments = Math.min(WATER_SEGMENTS, Math.round((glasses / Math.max(1, targetGlasses)) * WATER_SEGMENTS));

  return (
    <Card style={{ padding: '16px 18px', marginBottom: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>WATER</span>
        <StatBadge>{glasses} / {round1(targetMl / 1000)}L</StatBadge>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: 'var(--water-blue)', marginBottom: 12 }}>
        {glasses * WATER_ML_PER_GLASS}ml
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        {Array.from({ length: WATER_SEGMENTS }, (_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < filledSegments ? 'var(--water-blue)' : 'var(--border-default)' }} />
        ))}
      </div>
      <button
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={clearPressTimer}
        onPointerCancel={clearPressTimer}
        title="Tap to add 250ml — hold to undo the last tap"
        style={{
          width: '100%', padding: '10px 0', borderRadius: 20, border: '1px solid var(--border-default)',
          background: 'var(--bg-subtle)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation', userSelect: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <i className="ti ti-plus" style={{ fontSize: 13 }} /> {WATER_ML_PER_GLASS}ml
      </button>
    </Card>
  );
}

// Fixed CSS height of the chart — the viewBox's height is set to match
// this exactly (see chartWidth below), so preserveAspectRatio="none" has
// nothing to stretch. A mismatched viewBox aspect ratio was the actual
// cause of the chart looking "distorted" — not the line style — since
// non-uniform scaling exaggerates the vertical axis relative to the
// horizontal one on every device where the two ratios don't line up.
const CHART_HEIGHT = 110;

function TodayCard({ consumed, target, baseCalorieTarget, chartDays, chartRange, setChartRange, onChartClick }) {
  // Measure the chart's actual rendered width so the SVG viewBox can match
  // it 1:1 in pixels, instead of guessing a fixed width and letting the
  // browser stretch it to fit (see CHART_HEIGHT note above).
  const chartRef = useRef(null);
  const [chartWidth, setChartWidth] = useState(300);
  useEffect(() => {
    const el = chartRef.current;
    if (!el) return;
    const measure = () => setChartWidth(el.clientWidth || 300);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Each day's own target is the plain baseline plus whatever THAT day
  // burned (see Dashboard's useWorkoutLogsRange) — not one shared number
  // for the whole chart. Logging a workout for one day must only raise
  // that day's segment of the target line, not the rest of the week's.
  const dayTargets = chartDays.map(d => (d.baseTarget ?? baseCalorieTarget) + (d.caloriesBurned || 0));

  // Headroom above the tallest of any day's target/actual so neither the
  // target line nor a big over-target bar sits flush against the top edge.
  const max = Math.max(target, ...chartDays.map(d => d.calories), ...dayTargets, 1) * 1.08;
  const topPad = 4;
  const baseline = CHART_HEIGHT - 6;
  const plotHeight = baseline - topPad;
  const w = chartWidth;
  // Gap shrinks as the range grows so 90 daily bars (3M) still fit without
  // overlapping — bars get thin rather than the chart scrolling or sampling.
  const gap = chartDays.length > 40 ? 1 : chartDays.length > 14 ? 2 : 5;
  const barWidth = Math.max(1, (w - gap * (chartDays.length - 1)) / chartDays.length);
  const bars = chartDays.map((d, i) => {
    const dayTarget = dayTargets[i];
    const barHeight = (d.calories / max) * plotHeight;
    return {
      x: i * (barWidth + gap),
      y: baseline - barHeight,
      height: barHeight,
      over: d.calories > dayTarget,
    };
  });

  // A handful of evenly-spaced labels regardless of range, so 90 days
  // doesn't cram 90 labels under the axis.
  const labelCount = Math.min(chartDays.length, chartRange === '1W' ? 7 : 5);
  const labelStep = Math.max(1, Math.floor((chartDays.length - 1) / (labelCount - 1)));
  const labelIdxs = new Set();
  for (let i = 0; i < chartDays.length; i += labelStep) labelIdxs.add(i);
  labelIdxs.add(chartDays.length - 1);

  return (
    <Card style={{ padding: '16px 18px', marginBottom: 0, cursor: 'pointer' }} onClick={onChartClick}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>TODAY</span>
        <StatBadge>{round1(Math.max(0, target - consumed))} left</StatBadge>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(consumed).toLocaleString()}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/ {target.toLocaleString()} kcal</span>
      </div>

      {/* Everyday baseline, not the per-day (workout-adjusted) target the
          dashed line itself steps up to — there's no single flat number
          honest enough to print for a week that includes a workout day,
          so this labels the one constant real value instead. */}
      <div style={{ textAlign: 'right', fontSize: 10, color: 'var(--text-hint)', marginTop: 6 }}>{baseCalorieTarget.toLocaleString()} KCAL</div>

      <svg ref={chartRef} viewBox={`0 0 ${w} ${CHART_HEIGHT}`} style={{ width: '100%', height: CHART_HEIGHT, marginTop: 2, display: 'block' }}>
        {/* The user's own target is one continuous line across the whole
            chart; a day with burned calories breaks out of it as its own
            raised segment (see targetLineSegments). */}
        {targetLineSegments(chartDays, baseCalorieTarget).map(seg => {
          const y = baseline - (seg.value / max) * plotHeight;
          return <line key={`target-${seg.start}`} x1={bars[seg.start].x} y1={y} x2={bars[seg.end].x + barWidth} y2={y} stroke="var(--text-hint)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0 5" />;
        })}
        {bars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={barWidth}
            height={Math.max(0, b.height)}
            rx={Math.min(3, barWidth / 2)}
            fill={b.over ? 'var(--danger-strong)' : 'var(--accent-strong)'}
            opacity={b.over ? 0.85 : 1}
          />
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }} onClick={e => e.stopPropagation()}>
        {chartDays.map((d, i) => (
          <span key={d.date} style={{ fontSize: 10, color: 'var(--text-hint)', visibility: labelIdxs.has(i) ? 'visible' : 'hidden' }}>
            {chartRange === '1W'
              ? new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short' })
              : new Date(d.date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
          </span>
        ))}
      </div>

      <div onClick={e => e.stopPropagation()}>
        <SegmentedControl
          options={CHART_RANGE_OPTIONS}
          value={chartRange}
          onChange={setChartRange}
          fill
        />
      </div>
    </Card>
  );
}

// Weight + Today side by side, Water full-width below — the bento-card
// grid the Weight/Water rail used to squeeze into one card with the chart.
// Weight + Water stack in the left column (together they run about as
// tall as Today's chart card on the right) — not three cards stacked
// full-width, which is what left Weight's card looking half-empty with
// Water stranded below both instead of filling the rest of its column.
function DashboardTopCards({ latestWeight, weightTrendKg, weightUnit, recentWeights, targetWeight, onWeightClick, glasses, targetGlasses, setGlasses, ...todayProps }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <WeightCard latest={latestWeight} weightTrendKg={weightTrendKg} weightUnit={weightUnit} recentWeights={recentWeights} targetWeight={targetWeight} onClick={onWeightClick} />
        <WaterCard glasses={glasses} targetGlasses={targetGlasses} setGlasses={setGlasses} />
      </div>
      <TodayCard {...todayProps} />
    </div>
  );
}

// ─── Swipeable hero/calendar pager — the calorie/weight/water card and
// the logging calendar share one horizontal pager instead of both being
// separate full-width blocks. Their natural heights differ a lot (the
// calendar can run to 6 row of days some months, the hero card is much
// shorter), so the frame animates its own height to match whichever page
// is active via ResizeObserver rather than clipping content or leaving
// dead space under the shorter page. Drag tracking is plain pointer
// events in px (not CSS scroll-snap) so the height and transform can be
// driven together from the same piece of state.
// Restored per explicit request — swipe (or tap the dots) to get from the
// calorie/weight/water glance to the logging calendar. Drag tracking is
// plain pointer events in px (not CSS scroll-snap) so the height and
// transform can be driven together from the same piece of state.
function SwipePager({ pages }) {
  const [page, setPage] = useState(0);
  const [animate, setAnimate] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [height, setHeight] = useState(undefined);
  const [dragX, setDragX] = useState(0);
  const containerRef = useRef(null);
  const pageRefs = useRef([]);
  const drag = useRef({ startX: 0, dx: 0, dragging: false });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Re-measures whenever the active page's own content changes size (e.g.
  // the calendar swapping between a 5-row and 6-row month), not just when
  // the page index changes.
  useLayoutEffect(() => {
    const el = pageRefs.current[page];
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [page]);

  function onPointerDown(e) {
    if (pages.length < 2) return;
    drag.current = { startX: e.clientX, dx: 0, dragging: true };
    setAnimate(false);
  }
  function onPointerMove(e) {
    if (!drag.current.dragging) return;
    let dx = e.clientX - drag.current.startX;
    if ((page === 0 && dx > 0) || (page === pages.length - 1 && dx < 0)) dx *= 0.35;
    drag.current.dx = dx;
    setDragX(dx);
  }
  function onPointerUp() {
    if (!drag.current.dragging) return;
    drag.current.dragging = false;
    const dx = drag.current.dx;
    const threshold = Math.max(40, containerWidth * 0.18);
    setAnimate(true);
    setDragX(0);
    if (dx < -threshold && page < pages.length - 1) setPage(p => p + 1);
    else if (dx > threshold && page > 0) setPage(p => p - 1);
  }

  const offset = -page * containerWidth + dragX;

  return (
    <div>
      <div
        ref={containerRef}
        style={{ overflow: 'hidden', borderRadius: 16, height, transition: animate ? 'height 0.25s ease' : 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            width: containerWidth ? containerWidth * pages.length : '100%',
            transform: `translateX(${offset}px)`,
            transition: animate ? 'transform 0.25s ease' : 'none',
            touchAction: 'pan-y',
          }}
        >
          {pages.map((p, i) => (
            <div key={i} ref={el => { pageRefs.current[i] = el; }} style={{ width: containerWidth || '100%', flexShrink: 0 }}>
              {p}
            </div>
          ))}
        </div>
      </div>
      {pages.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 10 }}>
          {pages.map((_, i) => (
            <button
              key={i}
              className="hit-slop hit-slop-wide"
              onClick={() => { setAnimate(true); setPage(i); }}
              aria-label={`Page ${i + 1} of ${pages.length}`}
              style={{
                width: i === page ? 16 : 6, height: 6, borderRadius: 99, border: 'none', padding: 0, cursor: 'pointer',
                background: i === page ? 'var(--accent)' : 'var(--border-strong)', transition: 'width 0.2s ease, background 0.2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MacroCell({ label, value, target, color, tone, onClick }) {
  const pct = target > 0 ? Math.round((value / target) * 100) : 0;
  const barPct = Math.min(100, pct);
  return (
    <Card style={{ padding: '12px 10px', marginBottom: 0, cursor: 'pointer' }} onClick={onClick}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', marginBottom: 8, gap: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{label.toUpperCase()}</span>
        <StatBadge tone={tone} style={{ padding: '2px 7px', fontSize: 11 }}>{pct}%</StatBadge>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color, whiteSpace: 'nowrap', marginBottom: 8 }}>
        {round1(value)}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>/{target}g</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--border-default)', overflow: 'hidden' }}>
        <div style={{ width: `${barPct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </Card>
  );
}

// ─── Favourites — real starred foods with a real quick-add, same "always
// log the default 1 serving" behaviour as the Food Search quick-add
// button (Phase 4), not decorative. Nothing renders if there are none
// yet, rather than showing empty/fake placeholders. ─────────────────────
// ─── Activity ────────────────────────────────────────────────────────────────
// Steps has no real data source yet — Apple Health / Google Fit / Health
// Connect are native-only APIs, unreachable from a PWA — so it stays a
// placeholder. Burned is real: manually-logged workouts (see
// LogWorkoutModal/useWorkoutLogs), MET-estimated from type/intensity/
// duration and editable, feeding back into the day's calorie budget.
function ActivityRow({ workouts, totalCaloriesBurned, onLogWorkout, onDeleteWorkout }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>ACTIVITY</span>
        <button onClick={onLogWorkout} className="hit-slop" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>
          <i className="ti ti-plus" style={{ fontSize: 13 }} /> Log workout
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ borderRight: '1px solid var(--border-default)', padding: '14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <i className="ti ti-walk" style={{ fontSize: 13 }} /> STEPS
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--text-hint)' }}>—</div>
        </div>
        <div style={{ padding: '14px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
            <i className="ti ti-flame" style={{ fontSize: 13 }} /> BURNED
          </div>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: totalCaloriesBurned ? 'var(--accent)' : 'var(--text-hint)' }}>
            {totalCaloriesBurned ? Math.round(totalCaloriesBurned).toLocaleString() : '—'}
          </div>
          {totalCaloriesBurned > 0 && <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>Active burn</div>}
        </div>
      </div>
      {workouts.length > 0 && (
        <div style={{ marginTop: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 10, padding: '0 12px' }}>
          {workouts.map(w => {
            const type = getWorkoutType(w.type);
            return (
              <WorkoutRow key={w.id} workout={w} type={type} onDelete={() => onDeleteWorkout(w.id)} />
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 8 }}>Steps will sync from Apple Health / Google Fit once the native app ships.</div>
    </div>
  );
}

// A single logged workout — tapping opens a small detail sheet with the
// delete action, instead of the row carrying its own inline "×" button.
function WorkoutRow({ workout: w, type, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ListRow
        avatar={<ListRow.SquareAvatar icon={type.icon} />}
        title={type.label}
        subtitleParts={[`${w.durationMinutes} min`, `${Math.round(w.caloriesBurned)} kcal`]}
        trailing={<ListRow.Chevron />}
        onClick={() => setOpen(true)}
      />
      {open && (
        <div onClick={() => setOpen(false)} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={type.label} className="modal-panel" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, padding: 20, width: '100%', maxWidth: 380 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <ListRow.SquareAvatar icon={type.icon} size={48} />
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{type.label}</div>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 }}>
              {w.durationMinutes} min · {Math.round(w.caloriesBurned)} kcal burned
            </p>
            <FormRow.Button icon="ti-trash" danger onClick={() => { onDelete(); setOpen(false); }}>Delete</FormRow.Button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Meal Log ─────────────────────────────────────────────────────────────────
function MealLog({ groups, onDelete, onSave, onNavigateFood, yesterdayByMeal, onCopyYesterday, copyingYesterday }) {
  const [open, setOpen] = useState({});
  const [expandedId, setExpandedId] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {groups.map(({ key, label, items }) => {
        const total = Math.round(items.reduce((s, i) => s + i.cal, 0));
        const protein = round1(items.reduce((s, i) => s + i.protein, 0));
        const carbs = round1(items.reduce((s, i) => s + i.carbs, 0));
        const fat = round1(items.reduce((s, i) => s + i.fat, 0));
        const isOpen = open[key];
        return (
          <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: '12px', overflow: 'hidden' }}>
            <button onClick={() => setOpen(o => ({ ...o, [key]: !o[key] }))} style={{ width: '100%', background: 'none', border: 'none', padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</div>
                {items.length > 0 && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: 2 }}>P {protein}g · C {carbs}g · F {fat}g</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{total} kcal</span>
                <span style={{ color: 'var(--text-hint)', fontSize: '12px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </div>
            </button>
            {items.length === 0 && yesterdayByMeal?.[key]?.length > 0 && (
              <YesterdayMealPrompt
                mealLabel={label}
                names={yesterdayByMeal[key].map(r => r.food_name).join(', ')}
                kcal={Math.round(yesterdayByMeal[key].reduce((sum, r) => sum + (Number(r.calories) || 0), 0))}
                onCommit={() => onCopyYesterday(key)}
                disabled={copyingYesterday}
              />
            )}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border-default)' }}>
                {items.length === 0 ? (
                  <p style={{ color: 'var(--text-hint)', fontSize: '13px', padding: '12px 16px' }}>Nothing logged yet</p>
                ) : (
                  items.map((item) => (
                    <LogItemRow
                      key={item.id}
                      item={item}
                      isExpanded={expandedId === item.id}
                      onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
                      onDelete={() => onDelete(item.id)}
                      onSave={async (fields) => { await onSave(item.id, fields); setExpandedId(null); }}
                    />
                  ))
                )}
                <button onClick={() => onNavigateFood(key)} style={{ width: '100%', background: 'none', border: 'none', color: 'var(--accent-dark)', fontSize: '13px', cursor: 'pointer', padding: '10px 16px', textAlign: 'left', transition: 'color 0.15s' }} onMouseEnter={e => e.target.style.color = 'var(--accent)'} onMouseLeave={e => e.target.style.color = 'var(--accent-dark)'}>
                  + Add food
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Confirm-email banner ───────────────────────────────────────────────────
// Onboarding now requires real signup before this page is reachable at all
// (RequireAuth's isUnsignedGuest gate) — the only account.is_anonymous
// state that can still land here is "submitted the signup form, hasn't
// clicked the confirmation link yet", so this no longer needs a separate
// "still just browsing as a guest" branch.
function ConfirmEmailBanner({ email }) {
  const [visible, setVisible] = useState(true);
  const [resendState, setResendState] = useState(null); // null | 'sending' | 'sent' | error string
  if (!visible) return null;

  async function resend() {
    setResendState('sending');
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
    setResendState(error ? (error.message || 'Could not resend — try again.') : 'sent');
  }

  return (
    <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span style={{ color: 'var(--accent)', fontSize: '14px', flexShrink: 0 }}>✉️</span>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', minWidth: 0, overflowWrap: 'anywhere' }}>
          Almost there — check <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{email}</span> to confirm your account.
          {resendState === 'sent' ? (
            <span style={{ color: 'var(--accent)', marginLeft: '4px' }}>Sent!</span>
          ) : (
            <button onClick={resend} disabled={resendState === 'sending'} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: resendState === 'sending' ? 'default' : 'pointer', marginLeft: '4px', padding: '6px 2px', textDecoration: 'underline' }}>
              {resendState === 'sending' ? 'Sending…' : 'Resend email'}
            </button>
          )}
          {resendState && resendState !== 'sending' && resendState !== 'sent' && (
            <span style={{ color: 'var(--danger)', display: 'block', marginTop: 4 }}>{resendState}</span>
          )}
        </span>
      </div>
      <button onClick={() => setVisible(false)} className="hit-slop" aria-label="Dismiss" style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>×</button>
    </div>
  );
}

// ─── Shortcut buttons ───────────────────────────────────────────────────────────
function ShortcutRow({ navigate, date }) {
  const shortcuts = [
    { label: 'Log food',  icon: 'ti-plus', action: () => navigate('/food', { state: { date } }) },
    { label: 'Scan barcode', icon: 'ti-barcode', action: () => navigate('/food', { state: { date, openScan: true } }) },
  ];
  return (
    <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
      {shortcuts.map((s, i) => (
        <button key={i} onClick={s.action} style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: '14px', padding: '15px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <i className={`ti ${s.icon}`} style={{ fontSize: 15, color: 'var(--text-primary)' }} />
          <span style={{ color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>{s.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Streak strip — replaces the old flame + number pill ("🔥 0 day
// streak") and the duplicate "Logging streak" row that used to live in
// Insights & Data. A week of dots (Sunday-start, matching LogCalendar's
// and DaySelector's own week convention elsewhere in the app) shows each
// day's actual logging status instead of reducing everything to a single
// number that reads as "0" — a failure — the moment a new day starts.
// Logged days fill in bold; not-yet-logged days stay light instead.
const STREAK_WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function StreakStrip({ byDate, onSelectDay }) {
  const today = todayLocalDate();
  const weekStart = new Date(today + 'T00:00:00');
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return todayLocalDate(d);
  });

  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
      {days.map((dateStr, i) => {
        const isFuture = dateStr > today;
        const isToday = dateStr === today;
        const logged = !!byDate.get(dateStr)?.calories;
        return (
          <button
            key={dateStr}
            className="hit-slop hit-slop-tight"
            disabled={isFuture}
            onClick={() => onSelectDay(dateStr)}
            title={isFuture ? undefined : (logged ? 'Logged — view this day' : 'Not logged — view this day')}
            style={{
              width: 40, height: 40, borderRadius: '50%', padding: 0, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700,
              background: logged ? 'var(--accent)' : 'transparent',
              border: `1px solid ${logged ? 'var(--accent)' : isToday ? 'var(--border-strong)' : 'var(--border-default)'}`,
              color: logged ? 'var(--accent-contrast)' : 'var(--text-hint)',
              opacity: isFuture ? 0.4 : 1,
              cursor: isFuture ? 'default' : 'pointer',
            }}
          >
            {STREAK_WEEKDAY_LABELS[i]}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const today = todayLocalDate();
  // Streak dots and both logging calendars (this page's compact one and
  // Progress's) deep-link here with a past date instead of the old /log
  // page — the whole point being "see and edit that day's dashboard, not
  // just its food log". Everything that's inherently a snapshot of one
  // day (food log, mood, water, the weight-log modal's target date, the
  // chart's trailing window, the calendar's default month) is scoped to
  // viewedDate; things that are "current status" regardless of which day
  // you're browsing (the streak strip, insights, this month's calendar
  // nav ceiling) stay anchored to real `today`.
  const viewedDate = location.state?.date || today;
  const isViewingToday = viewedDate === today;
  const { profile, save: saveProfile } = useProfile();
  const isPremium = !!profile?.is_premium;
  // Same default/derivation as DailyLog.jsx — reading the same profile
  // field is what keeps a choice made on either page in sync with the
  // other, rather than each page tracking it separately.
  const dailyLogView = profile?.daily_log_view || 'meals';
  const showSlots = isPremium && dailyLogView === 'slots';
  const [viewSaveError, setViewSaveError] = useState(null);
  async function handleViewChange(v) {
    setViewSaveError(null);
    try { await saveProfile({ daily_log_view: v }); } catch { setViewSaveError("Couldn't save — try again."); }
  }
  const { meals, slotTimeline, deleteFood, updateFood, addSlot, editSlot, removeSlot, refetch: refetchFoodLogs } = useFoodLogs(viewedDate);
  const { checkin, save: saveCheckin } = useCheckins(viewedDate);
  // 90 days (not 30) so the pattern engine's more specific candidates
  // (fibre, hydration, sugar, breakfast) have a real chance to each reach
  // their own 5-day-per-bucket minimum, not just the broadest ones — and
  // so the calorie hero's 1M/3M views can be sliced from data already in
  // hand instead of a second fetch.
  const { dailyData } = useHistory(dateNDaysAgo(90), today);
  const weightUnit = profile?.unit === 'imperial' ? 'lb' : 'kg';
  const { logs: weightLogs, latest: latestWeight, logWeight } = useWeightLogs(dateNDaysAgo(89), today);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const { closing: weightModalClosing, close: closeWeightModal } = useClosingTransition(() => setShowWeightModal(false));
  const { workouts, totalCaloriesBurned, create: createWorkout, remove: removeWorkout } = useWorkoutLogs(viewedDate);
  const [showWorkoutModal, setShowWorkoutModal] = useState(false);
  const { closing: workoutModalClosing, close: closeWorkoutModal } = useClosingTransition(() => setShowWorkoutModal(false));
  const [toast, setToast] = useState(null);
  const [toastError, setToastError] = useState(false);
  const [toastAction, setToastAction] = useState(null);
  function showToast(message, isError = false, action = null) {
    setToast(message);
    setToastError(isError);
    setToastAction(action);
  }
  const { byMeal: yesterdayByMeal, copy: copyFromYesterday, copying: copyingYesterday } = useCopyYesterday(viewedDate, refetchFoodLogs, showToast);
  // deleteFood/removeWorkout had no error handling anywhere they were
  // used — a failed delete just silently did nothing. Same reasoning as
  // DailyLog.jsx's identical wrapper: LogItemRow already catches and
  // inline-surfaces its own onSave failures, so only delete needs this.
  async function handleDeleteFoodItem(id) {
    try {
      await deleteFood(id);
    } catch {
      showToast("Couldn't delete — try again", true);
    }
  }
  async function handleDeleteWorkout(id) {
    try {
      await removeWorkout(id);
      // The chart's per-day target reads from useWorkoutLogsRange, a
      // separate fetch from useWorkoutLogs above — refetch it too so the
      // deleted workout's day drops back down immediately, not just on
      // next navigation.
      refetchBurnedByDate();
    } catch {
      showToast("Couldn't delete workout — try again", true);
    }
  }

  async function handleLogWorkout(entry) {
    await createWorkout(entry);
    refetchBurnedByDate();
  }

  const [calMonth, setCalMonth] = useState(() => { const d = new Date(viewedDate + 'T00:00:00'); d.setDate(1); return d; });
  // Clicking a streak dot or a calendar day re-navigates to this same
  // /dashboard route with a new date in location.state rather than
  // mounting a fresh component instance, so calMonth's one-time useState
  // initializer above only fires once — this effect is what actually
  // keeps the calendar showing the right month when the viewed day jumps
  // to a different one. Deliberately keyed on viewedDate, not on calMonth
  // itself, so it doesn't fight the prev/next-month buttons when the user
  // is just browsing the calendar without changing which day is loaded.
  useEffect(() => {
    const d = new Date(viewedDate + 'T00:00:00');
    d.setDate(1);
    setCalMonth(d);
  }, [viewedDate]);
  const calMonthStart = todayLocalDate(calMonth);
  const calMonthEnd = todayLocalDate(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
  const { dailyData: calData, loading: calLoading } = useHistory(calMonthStart, calMonthEnd);
  const calByDate = new Map(calData.map(d => [d.date, d]));
  const canGoNextMonth = calMonthStart < todayLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // The targets for the day being viewed — a rest day can have its own (see
  // lib/dayTargets.js); with none set every day gets the everyday targets.
  const viewedTargets = targetsForDate(profile, viewedDate);
  const targets = {
    calories: viewedTargets.calories || 2000,
    protein: { g: viewedTargets.protein_g || 150 },
    carbs: { g: viewedTargets.carbs_g || 200 },
    fat: { g: viewedTargets.fat_g || 67 },
  };
  const calorieTargetFor = (date) => targetsForDate(profile, date).calories || 2000;
  const calorieTarget = targets.calories;
  // Logged workouts add back to today's budget ("eat back exercise
  // calories") — burn 300kcal, the day's target goes up by 300. Only
  // affects this display total, not `targets.calories`/`calorieTarget`
  // itself, which stays the plain baseline everywhere else (macro grams,
  // adaptive-target calc) that isn't meant to move with exercise.
  const effectiveCalorieTarget = calorieTarget + totalCaloriesBurned;

  const { compute: computeAdaptive } = useAdaptiveTarget();

  // No server-side cron for this — an adaptive target is only ever
  // "fresh as of last app open", recomputed once per mount here (the
  // most-visited page) and again whenever Settings' Adaptive tab is
  // opened. Only writes back when the new number actually differs, so a
  // string of dashboard visits in one sitting doesn't spam profile
  // updates for a value that hasn't changed.
  const adaptiveRefreshedRef = useRef(false);
  useEffect(() => {
    if (!profile || profile.calorie_mode !== 'adaptive' || adaptiveRefreshedRef.current) return;
    adaptiveRefreshedRef.current = true;
    (async () => {
      const result = await computeAdaptive(profile.goal || 'maintain');
      if (!result.ready || Math.abs(result.target - (profile.calorie_target || 0)) < 10) return;
      const split = goalMacroSplits[profile.goal] || goalMacroSplits.maintain;
      const built = buildTargets(result.target, split, profile.water_target || 8);
      await saveProfile({
        calorie_target: built.calories,
        protein_g: built.protein.g,
        carbs_g: built.carbs.g,
        fat_g: built.fat.g,
      });
    })();
  }, [profile, computeAdaptive, saveProfile]);

  const name = profile?.name || 'there';
  const { note: coachNote, dismiss: dismissCoachNote } = useCoachNote('general');
  const [coachChatOpen, setCoachChatOpen] = useState(false);
  // Onboarding now requires real signup before RequireAuth lets anyone
  // reach this page (see its isUnsignedGuest gate) — is_anonymous here can
  // only mean "submitted the signup form, hasn't clicked the confirmation
  // link yet", never "browsing without ever signing up". new_email (not
  // user?.email, which Supabase leaves empty until the address is
  // actually confirmed) is what was silently broken before: it's what
  // actually distinguishes "signed up, needs to confirm" from a true
  // unsigned guest, and using user?.email here — always empty for a
  // pending account — made a friend's real signup look like it had
  // silently failed.
  const pendingConfirmation = !!user?.is_anonymous && !!user?.new_email;
  const streak = computeStreak(dailyData);

  const initials = (name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const mood = checkin?.mood ?? null;
  const energy = checkin?.energy ?? 6;
  const glasses = checkin?.water_glasses ?? 0;
  const setGlasses = (n) => saveCheckin({ mood, energy, water_glasses: n });

  const allItems = Object.values(meals).flat();
  const consumed        = allItems.reduce((s, i) => s + i.cal,     0);
  const consumedProtein = allItems.reduce((s, i) => s + i.protein, 0);
  const consumedCarbs   = allItems.reduce((s, i) => s + i.carbs,   0);
  const consumedFat     = allItems.reduce((s, i) => s + i.fat,     0);

  const byDate = new Map(dailyData.map(d => [d.date, d]));

  const [chartRange, setChartRange] = useState('1W');
  const chartRangeDays = { '1W': 7, '1M': 30, '3M': 90 }[chartRange];
  const chartStartDate = dateNDaysAgo(chartRangeDays - 1, new Date(viewedDate + 'T00:00:00'));
  // Per-day burned calories across the chart's own date range (not just
  // viewedDate — see useWorkoutLogs above) so each bar's target reflects
  // what was actually burned *that* day, not today's total applied to
  // every day. See DashboardHero's per-bar target computation below.
  const { burnedByDate, refetch: refetchBurnedByDate } = useWorkoutLogsRange(chartStartDate, viewedDate);
  const chartDays = dateRange(chartStartDate, viewedDate).map(date => ({
    ...(byDate.get(date) || { date, calories: 0 }),
    caloriesBurned: burnedByDate.get(date) || 0,
    baseTarget: calorieTargetFor(date),
  }));

  // Same recent-points derivation as WeightLogModal's own sparkline below
  // — kept in sync intentionally, since both are "the last handful of real
  // entries," not two different windows that could quietly drift apart.
  const recentWeights = [...weightLogs]
    .sort((a, b) => a.logged_date.localeCompare(b.logged_date))
    .slice(-10)
    .map(w => round1(fromKg(toKg(w.weight, w.unit), weightUnit)));

  // Real 7-day weight change from actually-logged entries — omitted (not
  // faked) if there isn't at least one weight log in each end of the
  // window to compare.
  const sevenDaysAgo = dateNDaysAgo(6);
  const weightWindow = weightLogs.filter(w => w.logged_date >= sevenDaysAgo);
  const weightTrendKg = weightWindow.length >= 2
    ? (() => {
        const toKg = (w) => w.unit === 'lb' ? Number(w.weight) * 0.453592 : Number(w.weight);
        const sorted = [...weightWindow].sort((a, b) => a.logged_date.localeCompare(b.logged_date));
        return toKg(sorted[sorted.length - 1]) - toKg(sorted[0]);
      })()
    : null;

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date(viewedDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="dashboard" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{ minHeight: 40, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 12px', paddingTop: 10, paddingBottom: 4, position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
          <div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isViewingToday ? `${greeting}, ${name} 👋` : `${name}'s log`}
            </span>
            <span style={{ color: 'var(--text-hint)', fontSize: '13px', marginLeft: '12px' }}>{dateStr}</span>
            {!isViewingToday && (
              <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginLeft: '12px', padding: 0, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                ← Back to today
              </button>
            )}
          </div>
        </div>

        <div className="page-pad-top" style={{ paddingBottom: 12, borderBottom: '1px solid var(--border-default)' }}>
          <StreakStrip byDate={byDate} onSelectDay={(date) => navigate('/dashboard', { state: { date } })} />
        </div>

        <div className="page-pad app-content-pad" style={{ maxWidth: '1100px' }}>
          {pendingConfirmation && <ConfirmEmailBanner email={user?.new_email} />}
          <TrialBanner profile={profile} userId={user?.id} />
          {coachNote && <CoachNote note={coachNote} onDismiss={dismissCoachNote} onClick={() => setCoachChatOpen(true)} style={{ marginBottom: 16 }} />}
          {coachChatOpen && (
            <CoachChatModal
              trainerId={coachNote.trainer_id}
              trainerName={coachNote.trainer?.name}
              trainerLogoUrl={coachNote.trainer?.coach_logo_url}
              onClose={() => setCoachChatOpen(false)}
            />
          )}

          {/* Hero/calendar pager — swipe (or use the dots) to get from the
              calorie/weight/water glance to the logging calendar. Restored
              per explicit request after a brief stacked-layout experiment. */}
          <div style={{ marginBottom: '16px' }}>
            <SwipePager
              pages={[
                <DashboardTopCards
                  consumed={consumed}
                  target={effectiveCalorieTarget}
                  baseCalorieTarget={calorieTarget}
                  chartDays={chartDays}
                  chartRange={chartRange}
                  setChartRange={setChartRange}
                  onChartClick={() => navigate('/expenditure')}
                  latestWeight={latestWeight}
                  weightTrendKg={weightTrendKg}
                  weightUnit={weightUnit}
                  recentWeights={recentWeights}
                  targetWeight={profile?.target_weight}
                  onWeightClick={() => setShowWeightModal(true)}
                  glasses={glasses}
                  targetGlasses={profile?.water_target || 8}
                  setGlasses={setGlasses}
                />,
                <LogCalendar
                  month={calMonth}
                  byDate={calByDate}
                  calorieTarget={calorieTargetFor}
                  loading={calLoading}
                  onPrevMonth={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  onNextMonth={() => canGoNextMonth && setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  canGoNext={canGoNextMonth}
                  onSelectDay={(date) => navigate('/dashboard', { state: { date } })}
                  compact
                  streak={streak}
                />,
              ]}
            />
          </div>

          <div className="grid-3-fixed" style={{ gap: 12, marginBottom: '20px' }}>
            <MacroCell label="Protein" value={consumedProtein} target={targets.protein.g} color={ACCENT} tone="accent" onClick={() => navigate('/nutrients', { state: { date: viewedDate } })} />
            <MacroCell label="Carbs" value={consumedCarbs} target={targets.carbs.g} color={WATER_BLUE} tone="carbs" onClick={() => navigate('/nutrients', { state: { date: viewedDate } })} />
            <MacroCell label="Fat" value={consumedFat} target={targets.fat.g} color={AI_PURPLE} tone="fat" onClick={() => navigate('/nutrients', { state: { date: viewedDate } })} />
          </div>

          <ActivityRow
            workouts={workouts}
            totalCaloriesBurned={totalCaloriesBurned}
            onLogWorkout={() => setShowWorkoutModal(true)}
            onDeleteWorkout={handleDeleteWorkout}
          />

          <ShortcutRow navigate={navigate} date={viewedDate} />

          {/* Daily food log */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span onClick={() => navigate('/log')} style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Daily food log <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
              </span>
              <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600 }}>{Math.round(consumed)} kcal logged</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', gap: 10 }}>
              <span onClick={() => navigate('/recipes')} style={{ color: 'var(--text-hint)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <i className="ti ti-bookmark" style={{ fontSize: 12 }} /> Recipes
              </span>
              {isPremium && (
                <DailyLogViewToggle value={dailyLogView} onChange={handleViewChange} />
              )}
            </div>
            {viewSaveError && <p style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 10 }}>{viewSaveError}</p>}
            {showSlots ? (
              <SlotTimeline
                segments={slotTimeline}
                onDelete={handleDeleteFoodItem}
                onSave={updateFood}
                onNavigateAdd={(slot) => navigate('/food', { state: { date: viewedDate, presetSlotId: slot.id, presetTime: slot.slotTime } })}
                onAddSlot={addSlot}
                onEditSlot={editSlot}
                onDeleteSlot={removeSlot}
                emptyMessage="Nothing set up for today yet — add your first slot below."
              />
            ) : (
              <MealLog
                groups={Object.entries(meals).map(([key, items]) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), items }))}
                onDelete={handleDeleteFoodItem}
                onSave={updateFood}
                onNavigateFood={(key) => navigate('/food', { state: { date: viewedDate, openMeal: key } })}
                yesterdayByMeal={yesterdayByMeal}
                onCopyYesterday={copyFromYesterday}
                copyingYesterday={copyingYesterday}
              />
            )}
          </div>

        </div>
      </div>

      {showWeightModal && (
        <WeightLogModal
          weightLogs={weightLogs}
          latest={latestWeight}
          unit={weightUnit}
          closing={weightModalClosing}
          onClose={closeWeightModal}
          onSave={(w) => logWeight(viewedDate, w, weightUnit)}
          onViewTrend={() => { closeWeightModal(); navigate('/expenditure', { state: { scrollTo: 'weight' } }); }}
        />
      )}
      {showWorkoutModal && (
        <LogWorkoutModal
          weightKg={weightInKg(profile)}
          closing={workoutModalClosing}
          onClose={closeWorkoutModal}
          onSave={handleLogWorkout}
        />
      )}
      {toast && <Toast message={toast} error={toastError} action={toastAction} duration={toastAction ? 5000 : 2200} onDone={() => setToast(null)} />}
    </div>
  );
}
