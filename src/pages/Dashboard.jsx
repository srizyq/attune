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
import { todayLocalDate, dateNDaysAgo, dateRange, generateInsights, computeStreak } from '../lib/patterns';
import { goalMacroSplits, buildTargets } from '../lib/calorieTargets';
import { toKg, fromKg } from '../lib/adaptiveTDEE';
import { useClosingTransition } from '../hooks/useClosingTransition';
import AppNav from '../components/AppNav';
import CoachNote from '../components/CoachNote';
import CoachChatModal from '../components/CoachChatModal';
import { useCoachNote } from '../hooks/useCoach';
import LogItemRow from '../components/LogItemRow';
import LogCalendar from '../components/LogCalendar';
import HourlyTimeline from '../components/HourlyTimeline';
import { round1 } from '../lib/format';
import { hourToHHMM } from '../lib/mealTime';

// Accent/water-blue/ai-purple are the same hex in both themes by design.
const ACCENT = '#8fbc8f';
const WATER_BLUE = '#6aabcf';
const AI_PURPLE = '#9f97e8';

// ─── Calorie hero — real weekly/monthly/quarterly trend, no decorative
// elements without real data behind them (no fake "uncertainty band" —
// this is a chart of actual logged calories, not an estimate). ──────────
const CHART_RANGES = [{ id: '1W', days: 7 }, { id: '1M', days: 30 }, { id: '3M', days: 90 }];

// One tap adds 250ml (one "glass" in the underlying water_glasses count —
// no schema change, this is purely a display/interaction relabel). Holding
// the tile for ~500ms removes the most recent addition instead, since the
// tile is too small to show a row of individually-tappable glasses like
// the old WaterTracker did.
const WATER_ML_PER_GLASS = 250;
const WATER_LONG_PRESS_MS = 500;

function WeightTile({ latest, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, width: '100%', textAlign: 'left', background: 'none', border: 'none',
        borderBottom: '1px solid var(--border-default)', padding: '14px 12px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', fontFamily: 'inherit',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>WEIGHT</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
        {latest ? `${latest.weight}${latest.unit}` : '—'}
      </div>
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
      <div onClick={e => e.stopPropagation()} className={`modal-panel${closing ? ' is-closing' : ''}`} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, width: '100%', maxWidth: 340, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: 'var(--text-primary)' }}>Log weight</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1 }}>×</button>
        </div>

        {recent.length >= 2 && (
          <div style={{ marginBottom: 16 }}>
            <WeightSparkline points={recent} color="#8fbc8f" />
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

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder={`Weight (${unit})`}
            style={{
              flex: 1, padding: '11px 14px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)',
              borderRadius: 10, color: 'var(--text-primary)', fontSize: 15, fontFamily: "'DM Sans', sans-serif", outline: 'none',
            }}
          />
          <button
            onClick={submit}
            disabled={!value || saving}
            style={{
              padding: '11px 18px', background: !value || saving ? 'var(--border-default)' : 'var(--accent)',
              border: 'none', borderRadius: 10, color: !value || saving ? 'var(--text-muted)' : '#0f0f0f',
              fontSize: 14, fontWeight: 600, cursor: !value || saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {saving ? '…' : 'Save'}
          </button>
        </div>

        <button
          onClick={onViewTrend}
          style={{ width: '100%', background: 'none', border: 'none', color: 'var(--accent-dark)', fontSize: 13, cursor: 'pointer', padding: '4px 0', fontFamily: "'DM Sans', sans-serif" }}
        >
          View trend →
        </button>
      </div>
    </div>
  );
}

function WaterTile({ glasses, setGlasses }) {
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

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={clearPressTimer}
      onPointerCancel={clearPressTimer}
      style={{
        flex: 1, width: '100%', textAlign: 'left', background: 'none', border: 'none',
        padding: '14px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', fontFamily: 'inherit', touchAction: 'manipulation', userSelect: 'none',
      }}
      title="Tap to add 250ml — hold to undo the last tap"
    >
      <div style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em', marginBottom: 6 }}>WATER</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: 'var(--water-blue)' }}>
        {glasses * WATER_ML_PER_GLASS}ml
      </div>
    </button>
  );
}

// Fixed CSS height of the chart — the viewBox's height is set to match
// this exactly (see chartWidth below), so preserveAspectRatio="none" has
// nothing to stretch. A mismatched viewBox aspect ratio was the actual
// cause of the chart looking "distorted" — not the line style — since
// non-uniform scaling exaggerates the vertical axis relative to the
// horizontal one on every device where the two ratios don't line up.
const CHART_HEIGHT = 110;

function DashboardHero({ consumed, target, chartDays, chartRange, setChartRange, onChartClick, latestWeight, onWeightClick, glasses, setGlasses }) {
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

  const max = Math.max(target, ...chartDays.map(d => d.calories), 1);
  const min = Math.min(...chartDays.map(d => d.calories), target);
  const span = max - min || 1;
  const topPad = 10;
  const baseline = CHART_HEIGHT - 10;
  const norm = (v) => baseline - ((v - min) / span) * (baseline - topPad);
  const w = chartWidth;
  const points = chartDays.map((d, i) => [
    (i / Math.max(1, chartDays.length - 1)) * w,
    norm(d.calories),
  ]);
  const linePts = points.map(p => p.join(',')).join(' ');
  const areaPts = `0,${baseline} ${linePts} ${w},${baseline}`;
  const showDots = chartDays.length <= 10;

  // A handful of evenly-spaced labels regardless of range, so 90 days
  // doesn't cram 90 labels under the axis.
  const labelCount = Math.min(chartDays.length, chartRange === '1W' ? 7 : 5);
  const labelStep = Math.max(1, Math.floor((chartDays.length - 1) / (labelCount - 1)));
  const labelIdxs = new Set();
  for (let i = 0; i < chartDays.length; i += labelStep) labelIdxs.add(i);
  labelIdxs.add(chartDays.length - 1);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden', display: 'flex' }}>
      {/* Weight + water — compact glance tiles, replacing the old
          standalone Weight card and Check-in water card. */}
      <div style={{ width: 104, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border-default)' }}>
        <WeightTile latest={latestWeight} onClick={onWeightClick} />
        <WaterTile glasses={glasses} setGlasses={setGlasses} />
      </div>

      <div style={{ flex: 1, minWidth: 0, padding: '18px 16px', cursor: 'pointer' }} onClick={onChartClick}>
        {/* Stacked, not side-by-side — this panel is narrower now that
            weight/water share the card, and TODAY's big number + REMAINING's
            block no longer both fit on one row without wrapping badly. */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>TODAY</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>{Math.round(consumed).toLocaleString()}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>/ {target.toLocaleString()} kcal</span>
            <span style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 600, marginLeft: 'auto' }}>
              {round1(Math.max(0, target - consumed))} left
            </span>
          </div>
        </div>

        <svg ref={chartRef} viewBox={`0 0 ${w} ${CHART_HEIGHT}`} style={{ width: '100%', height: CHART_HEIGHT, marginTop: 10, display: 'block' }}>
          <polygon points={areaPts} fill="var(--accent)" opacity="0.08" />
          <polyline points={linePts} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {showDots && points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 4 : 2.5} fill={i === points.length - 1 ? 'var(--accent)' : 'var(--bg-card)'} stroke="var(--accent)" strokeWidth="1.5" />
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

        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'inline-flex', gap: 2, background: 'var(--pill-track)', borderRadius: 99, padding: 3 }}>
            {CHART_RANGES.map(r => (
              <button
                key={r.id}
                onClick={() => setChartRange(r.id)}
                style={{
                  padding: '6px 14px', borderRadius: 99, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  background: chartRange === r.id ? 'var(--pill-bg)' : 'transparent',
                  color: chartRange === r.id ? 'var(--pill-text)' : 'var(--text-muted)',
                }}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>
      </div>
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

function MacroCell({ label, value, target, color }) {
  return (
    <div style={{ padding: '14px 10px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label.toUpperCase()}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
        {round1(value)}<span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>g/{target}g</span>
      </div>
    </div>
  );
}

// ─── Favourites — real starred foods with a real quick-add, same "always
// log the default 1 serving" behaviour as the Food Search quick-add
// button (Phase 4), not decorative. Nothing renders if there are none
// yet, rather than showing empty/fake placeholders. ─────────────────────
// ─── Activity placeholder ───────────────────────────────────────────────────
// No real data source yet — Apple Health / Google Fit / Health Connect are
// native-only APIs, unreachable from a PWA. This reserves the visual slot
// and communicates the roadmap so wiring in a real Capacitor health plugin
// later is a data change, not a layout change.
function ActivityRow() {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>ACTIVITY</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>COMING SOON</span>
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
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 15, fontWeight: 700, color: 'var(--text-hint)' }}>—</div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 8 }}>Will sync from Apple Health / Google Fit once the native app ships.</div>
    </div>
  );
}

// ─── Mood Check-in ────────────────────────────────────────────────────────────
function MoodCheckin({ mood, setMood, energy, setEnergy }) {
  const moods = [
    { id: 'great', emoji: '😄', label: 'Great' },
    { id: 'good',  emoji: '🙂', label: 'Good' },
    { id: 'okay',  emoji: '😐', label: 'Okay' },
    { id: 'low',   emoji: '😔', label: 'Low' },
    { id: 'tired', emoji: '😴', label: 'Tired' },
  ];
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
        {moods.map(m => (
          <button key={m.id} onClick={() => setMood(m.id)} title={m.label} style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: `1px solid ${mood === m.id ? 'var(--border-active)' : 'var(--border-default)'}`, background: mood === m.id ? 'var(--accent-bg)' : 'transparent', cursor: 'pointer', fontSize: '20px', transition: 'background 0.15s, border-color 0.15s' }}>
            {m.emoji}
          </button>
        ))}
      </div>
      <div>
        <div style={{ color: 'var(--text-hint)', fontSize: '11px', marginBottom: '6px' }}>Energy level</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setEnergy(n)} style={{ flex: 1, height: '6px', borderRadius: '99px', border: 'none', background: n <= energy ? 'var(--accent)' : 'var(--border-default)', cursor: 'pointer', transition: 'background 0.15s', padding: 0 }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ color: 'var(--text-hint)', fontSize: '10px' }}>low</span>
          <span style={{ color: 'var(--text-hint)', fontSize: '10px' }}>high</span>
        </div>
      </div>
    </div>
  );
}

// ─── Meal Log ─────────────────────────────────────────────────────────────────
function MealLog({ groups, onDelete, onSave, onNavigateFood }) {
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
          <div key={key} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '12px', overflow: 'hidden' }}>
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

// ─── Guest Banner ─────────────────────────────────────────────────────────────
function GuestBanner({ daysRemaining, onSave, pendingConfirmation, email }) {
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ color: 'var(--accent)', fontSize: '14px' }}>{pendingConfirmation ? '✉️' : '🌿'}</span>
        {pendingConfirmation ? (
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Almost there — check <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{email}</span> to confirm your account.
            {resendState === 'sent' ? (
              <span style={{ color: 'var(--accent)', marginLeft: '4px' }}>Sent!</span>
            ) : (
              <button onClick={resend} disabled={resendState === 'sending'} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: resendState === 'sending' ? 'default' : 'pointer', marginLeft: '4px', padding: 0, textDecoration: 'underline' }}>
                {resendState === 'sending' ? 'Sending…' : 'Resend email'}
              </button>
            )}
            {resendState && resendState !== 'sending' && resendState !== 'sent' && (
              <span style={{ color: 'var(--danger)', display: 'block', marginTop: 4 }}>{resendState}</span>
            )}
          </span>
        ) : (
          <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Guest mode — <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{daysRemaining} days</span> remaining.
            <button onClick={onSave} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', marginLeft: '4px', padding: 0, textDecoration: 'underline' }}>Save your data →</button>
          </span>
        )}
      </div>
      <button onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'pointer', fontSize: '16px', flexShrink: 0 }}>×</button>
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

// ─── Insights & Data ────────────────────────────────────────────────────────
function ChangeRow({ label, value, trend }) {
  const up = trend === 'up';
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
        {trend && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--text-muted)' }}>
            <i className={`ti ti-trending-${up ? 'up' : 'down'}`} style={{ fontSize: 12 }} />
          </span>
        )}
      </div>
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
    <div style={{ display: 'flex', gap: 4 }}>
      {days.map((dateStr, i) => {
        const isFuture = dateStr > today;
        const isToday = dateStr === today;
        const logged = !!byDate.get(dateStr)?.calories;
        return (
          <button
            key={dateStr}
            disabled={isFuture}
            onClick={() => onSelectDay(dateStr)}
            title={isFuture ? undefined : (logged ? 'Logged — view this day' : 'Not logged — view this day')}
            style={{
              width: 22, height: 22, borderRadius: '50%', padding: 0, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              background: logged ? 'var(--accent)' : 'transparent',
              border: `1px solid ${logged ? 'var(--accent)' : isToday ? 'var(--border-strong)' : 'var(--border-default)'}`,
              color: logged ? '#0f0f0f' : 'var(--text-hint)',
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
  const { meals, dayTimeline, deleteFood, updateFood } = useFoodLogs(viewedDate);
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

  const targets = {
    calories: profile?.calorie_target || 2000,
    protein: { g: profile?.protein_g || 150 },
    carbs: { g: profile?.carbs_g || 200 },
    fat: { g: profile?.fat_g || 67 },
  };
  const calorieTarget = targets.calories;

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

  // Separate from the effect above — this one is purely for the "Avg.
  // expenditure" row below and runs regardless of calorie_mode, so
  // Calculated/Custom-mode users still see their real estimated
  // maintenance if they've logged enough to support one. Gated by the
  // same honesty rules as everywhere else the adaptive engine appears —
  // omitted entirely (not faked) when there isn't enough data yet.
  const [expenditureEstimate, setExpenditureEstimate] = useState(null);
  const expenditureFetchedRef = useRef(false);
  useEffect(() => {
    if (!profile || expenditureFetchedRef.current) return;
    expenditureFetchedRef.current = true;
    (async () => {
      const result = await computeAdaptive(profile.goal || 'maintain');
      if (result.ready) setExpenditureEstimate(result.estimate.tdee);
    })();
  }, [profile, computeAdaptive]);

  const name = profile?.name || 'there';
  const { note: coachNote, dismiss: dismissCoachNote } = useCoachNote('general');
  const [coachChatOpen, setCoachChatOpen] = useState(false);
  const isGuest = !!user?.is_anonymous;
  // An anonymous user with an email on their record already submitted the
  // "Create account" form — Supabase keeps is_anonymous true until the
  // confirmation link is clicked, so this is the one signal that tells
  // "never signed up" apart from "signed up, just needs to confirm email".
  // Both looked identical as plain "Guest mode" before, which is exactly
  // what made a friend's real signup look like it silently failed.
  const pendingConfirmation = isGuest && !!user?.email;
  const daysRemaining = user?.created_at
    ? Math.max(0, 7 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
    : 7;
  const insight = generateInsights(dailyData, 1)[0];
  const streak = computeStreak(dailyData);

  const initials = (name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const mood = checkin?.mood ?? null;
  const energy = checkin?.energy ?? 6;
  const glasses = checkin?.water_glasses ?? 0;
  const setMood = (m) => saveCheckin({ mood: m, energy });
  const setEnergy = (e) => saveCheckin({ mood, energy: e });
  const setGlasses = (n) => saveCheckin({ mood, energy, water_glasses: n });

  const allItems = Object.values(meals).flat();
  const consumed        = allItems.reduce((s, i) => s + i.cal,     0);
  const consumedProtein = allItems.reduce((s, i) => s + i.protein, 0);
  const consumedCarbs   = allItems.reduce((s, i) => s + i.carbs,   0);
  const consumedFat     = allItems.reduce((s, i) => s + i.fat,     0);

  const byDate = new Map(dailyData.map(d => [d.date, d]));

  const [chartRange, setChartRange] = useState('1W');
  const chartRangeDays = { '1W': 7, '1M': 30, '3M': 90 }[chartRange];
  const chartDays = dateRange(dateNDaysAgo(chartRangeDays - 1, new Date(viewedDate + 'T00:00:00')), viewedDate).map(date => byDate.get(date) || { date, calories: 0 });

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
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'DM Sans', sans-serif" }}>
      <AppNav active="dashboard" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{ minHeight: 52, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', paddingTop: 10, paddingBottom: 10, borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
          <div>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {isViewingToday ? `${greeting}, ${name} 👋` : `${name}'s log`}
            </span>
            <span style={{ color: 'var(--text-hint)', fontSize: '13px', marginLeft: '12px' }}>{dateStr}</span>
            {!isViewingToday && (
              <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginLeft: '12px', padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
                ← Back to today
              </button>
            )}
          </div>
          <StreakStrip byDate={byDate} onSelectDay={(date) => navigate('/dashboard', { state: { date } })} />
        </div>

        <div className="page-pad app-content-pad" style={{ maxWidth: '1100px' }}>
          {isGuest && <GuestBanner daysRemaining={daysRemaining} onSave={() => navigate('/settings')} pendingConfirmation={pendingConfirmation} email={user?.email} />}
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
                <DashboardHero
                  consumed={consumed}
                  target={calorieTarget}
                  chartDays={chartDays}
                  chartRange={chartRange}
                  setChartRange={setChartRange}
                  onChartClick={() => navigate('/expenditure')}
                  latestWeight={latestWeight}
                  onWeightClick={() => setShowWeightModal(true)}
                  glasses={glasses}
                  setGlasses={setGlasses}
                />,
                <LogCalendar
                  month={calMonth}
                  byDate={calByDate}
                  calorieTarget={calorieTarget}
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

          <div className="grid-3-fixed" onClick={() => navigate('/nutrients', { state: { date: viewedDate } })} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, overflow: 'hidden', marginBottom: '20px', gap: 0, cursor: 'pointer' }}>
            <div style={{ borderRight: '1px solid var(--border-default)' }}><MacroCell label="Protein" value={consumedProtein} target={targets.protein.g} color={ACCENT} /></div>
            <div style={{ borderRight: '1px solid var(--border-default)' }}><MacroCell label="Carbs" value={consumedCarbs} target={targets.carbs.g} color={WATER_BLUE} /></div>
            <MacroCell label="Fat" value={consumedFat} target={targets.fat.g} color={AI_PURPLE} />
          </div>

          <ActivityRow />

          <ShortcutRow navigate={navigate} date={viewedDate} />

          {/* Daily food log */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: '16px', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span onClick={() => navigate('/log')} style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                Daily food log <i className="ti ti-chevron-right" style={{ fontSize: 13 }} />
              </span>
              <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600 }}>{Math.round(consumed)} kcal logged</span>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <span onClick={() => navigate('/food', { state: { date: viewedDate, openSavedMeals: true } })} style={{ color: 'var(--text-hint)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <i className="ti ti-bookmark" style={{ fontSize: 12 }} /> Saved meals
              </span>
            </div>
            {isPremium ? (
              <HourlyTimeline
                segments={dayTimeline}
                onDelete={deleteFood}
                onSave={updateFood}
                onNavigateAdd={(hour) => navigate('/food', { state: { date: viewedDate, presetTime: hourToHHMM(hour) } })}
              />
            ) : (
              <MealLog
                groups={Object.entries(meals).map(([key, items]) => ({ key, label: key.charAt(0).toUpperCase() + key.slice(1), items }))}
                onDelete={deleteFood}
                onSave={updateFood}
                onNavigateFood={(key) => navigate('/food', { state: { date: viewedDate, openMeal: key } })}
              />
            )}
          </div>

          {/* Insights & Data */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 16, padding: 20, marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>INSIGHTS &amp; DATA</span>
              <span onClick={() => navigate('/insights')} style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                View patterns <i className="ti ti-chevron-right" style={{ fontSize: 12 }} />
              </span>
            </div>
            <div
              onClick={() => navigate('/insights')}
              style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 12, padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <i className="ti ti-sparkles" style={{ color: 'var(--accent)', fontSize: 15, marginTop: 2 }} />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {insight?.body || 'Start logging your meals to get personalised tips based on your patterns.'}
              </div>
            </div>
            <div>
              {weightTrendKg !== null && (
                <ChangeRow
                  label="Weight trend (7-day)"
                  value={`${weightTrendKg >= 0 ? '+' : ''}${round1(weightUnit === 'lb' ? weightTrendKg / 0.453592 : weightTrendKg)} ${weightUnit}`}
                  trend={weightTrendKg >= 0 ? 'up' : 'down'}
                />
              )}
              {expenditureEstimate != null && (
                <ChangeRow label="Estimated maintenance" value={`${expenditureEstimate.toLocaleString()} kcal`} />
              )}
            </div>
          </div>

          {/* Check in: mood — water moved into the hero card above. */}
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, marginBottom: '10px' }}>Check in</div>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: '16px', padding: '20px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '14px' }}>How are you feeling?</span>
              <MoodCheckin mood={mood} setMood={setMood} energy={energy} setEnergy={setEnergy} />
            </div>
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
          onViewTrend={() => { closeWeightModal(); navigate('/progress', { state: { scrollTo: 'weight' } }); }}
        />
      )}
    </div>
  );
}
