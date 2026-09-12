import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { useProfile } from "../hooks/useProfile";
import { useHistory } from "../hooks/useHistory";
import { useWeightLogs } from "../hooks/useWeightLogs";
import { useTheme } from "../hooks/useTheme";
import { todayLocalDate, dateNDaysAgo, dateRange, streakFor, computeStreak } from "../lib/patterns";
import { computeTrendWeight, toKg, fromKg } from "../lib/adaptiveTDEE";
import AppNav from "../components/AppNav";
import CoachNote from "../components/CoachNote";
import { useCoachNote } from "../hooks/useCoach";
import LogCalendar from "../components/LogCalendar";
import StreakItem from "../components/StreakItem";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

const WEIGHT_RANGES = [
  { id: "7d", label: "1 week", days: 7 },
  { id: "30d", label: "1 month", days: 30 },
  { id: "90d", label: "3 months", days: 90 },
  { id: "365d", label: "1 year", days: 365 },
  { id: "5y", label: "5 years", days: 1825 },
  { id: "all", label: "All time", days: null },
];

// Theme-invariant accents — identical hex in both themes by design.
const ACCENT = "#8fbc8f";
const WATER_BLUE = "#6aabcf";
const AI_PURPLE = "#9f97e8";

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
];

function avg(nums) {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}


// ── stat card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, hint }) {
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-default)",
      borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
        {label}
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 26, fontWeight: 700, color: value === "—" ? "var(--border-strong)" : "var(--text-primary)", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--border-strong)" }}>{hint}</div>
    </div>
  );
}

// ── week-at-a-glance bars ────────────────────────────────────────────────
// Shared with Dashboard's own week view — uses var()s + theme-invariant
// literals so it renders correctly wherever it's mounted.
export function WeekBars({ days, calorieTarget }) {
  const max = Math.max(calorieTarget || 0, ...days.map(d => d.calories), 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 100 }}>
        {days.map((d) => {
          const pct = Math.max(4, (d.calories / max) * 100);
          const onTarget = calorieTarget && d.calories > 0 && Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.15;
          return (
            <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: 100 }}>
              <div style={{
                width: "100%", height: `${pct}%`, borderRadius: "4px 4px 0 0",
                background: d.calories === 0 ? "var(--border-default)" : onTarget ? "#8fbc8f" : "#6aabcf",
                transition: "height 0.5s ease",
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {days.map((d) => (
          <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--text-muted)" }}>
            {new Date(d.date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short" })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main component ───────────────────────────────────────────────────────────
export default function Progress() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const { note: weightCoachNote, dismiss: dismissWeightCoachNote } = useCoachNote('weight');
  const { theme } = useTheme();
  const [range, setRange] = useState(30);
  const [weightRange, setWeightRange] = useState("30d");
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  // Dashboard's weight tile deep-links here instead of dropping the user
  // at the top of a long page — scrolls the weight chart into view once
  // on arrival rather than requiring them to scroll down to find it.
  const weightSectionRef = useRef(null);
  useEffect(() => {
    if (location.state?.scrollTo !== 'weight') return;
    // This page's stat cards, calendar, calorie/macro charts, and the
    // weight chart itself all resolve from independent async hooks
    // (useHistory, useWeightLogs, ...) that don't settle in lockstep —
    // confirmed live that the weight section's position kept moving for
    // over a second after mount as each one finished loading above it. A
    // single scrollIntoView (or even a couple of delayed retries) lands
    // wherever the layout happened to be at that instant, not where it
    // ends up. Instead: one smooth scroll for a nice first move, then
    // correct with instant scrolls every 150ms for ~2.5s so the view
    // keeps tracking the target as the page settles, converging once
    // nothing above it moves anymore.
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

  // Chart.js draws to <canvas>, which can't resolve CSS custom
  // properties — it needs a literal color string at render time. Unlike
  // the accent colors above, tick/grid/text colors genuinely differ
  // between themes, so they're branched here on the live theme instead
  // of hardcoded once.
  const isLight = theme === "light";
  const chartTextMuted = isLight ? "#6b6b6b" : "#666666";
  const chartGrid = isLight ? "#e7e7e5" : "#2a2a2a";

  const today = todayLocalDate();
  const { dailyData, loading } = useHistory(dateNDaysAgo(range - 1), today);
  const { dailyData: badgeData } = useHistory(dateNDaysAgo(59), today);

  // Calendar browses independently of the 7/30/90-day stat range, so it
  // needs its own fetch scoped to whatever month is currently shown.
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const calMonthStart = todayLocalDate(calMonth);
  const calMonthEnd = todayLocalDate(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 0));
  const { dailyData: calData, loading: calLoading } = useHistory(calMonthStart, calMonthEnd);
  const calByDate = useMemo(() => new Map(calData.map(d => [d.date, d])), [calData]);
  const canGoNextMonth = calMonthStart < todayLocalDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const weightRangeDays = WEIGHT_RANGES.find(r => r.id === weightRange)?.days;
  const { logs: weightLogs, loading: weightLoading, logWeight } = useWeightLogs(
    weightRangeDays ? dateNDaysAgo(weightRangeDays - 1) : null,
    today
  );
  const weightUnit = profile?.unit === "imperial" ? "lb" : "kg";

  const calorieTarget = profile?.calorie_target || null;
  const proteinTarget = profile?.protein_g || null;

  const byDate = useMemo(() => new Map(dailyData.map(d => [d.date, d])), [dailyData]);
  const allDates = useMemo(() => dateRange(dateNDaysAgo(range - 1), today), [range, today]);
  const filledDays = allDates.map(date => byDate.get(date) || { date, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, loggedMeals: 0, energy: null, mood: null });

  const loggedDays = filledDays.filter(d => d.loggedMeals > 0);
  const hasData = loggedDays.length > 0;

  const avgCalories = Math.round(avg(loggedDays.map(d => d.calories)));
  const avgProtein = Math.round(avg(loggedDays.map(d => d.protein_g)));
  const daysOnTarget = calorieTarget
    ? loggedDays.filter(d => Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.1).length
    : 0;
  const energyDays = filledDays.filter(d => d.energy != null);
  const avgEnergy = energyDays.length ? (avg(energyDays.map(d => d.energy))).toFixed(1) : null;

  const loggingStreak = computeStreak(badgeData);
  const calorieStreak = calorieTarget
    ? streakFor(badgeData, d => d.calories > 0 && Math.abs(d.calories - calorieTarget) <= calorieTarget * 0.15)
    : 0;
  const moodStreak = streakFor(badgeData, d => d.mood != null);
  const proteinStreak = proteinTarget
    ? streakFor(badgeData, d => d.protein_g >= proteinTarget * 0.9)
    : 0;

  // Trend weight (smoothed) plotted alongside the raw daily entries —
  // both converted through the same kg-based conversion into whatever
  // unit the profile currently displays in, rather than the old
  // behaviour of plotting each row's raw stored value regardless of
  // which unit it was logged in (a real gap: anyone who ever switched
  // metric/imperial would get a chart mixing the two on one axis).
  const trendPoints = useMemo(() => computeTrendWeight(weightLogs), [weightLogs]);
  const trendByDate = useMemo(() => new Map(trendPoints.map(p => [p.date, p.trend])), [trendPoints]);

  const weightLabels = weightLogs.map(w => new Date(w.logged_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", ...(weightRangeDays > 365 ? { year: "2-digit" } : {}) }));
  const weightChartData = {
    labels: weightLabels,
    datasets: [
      {
        label: "Weight",
        data: weightLogs.map(w => Math.round(fromKg(toKg(w.weight, w.unit), weightUnit) * 10) / 10),
        borderColor: ACCENT,
        backgroundColor: ACCENT + "22",
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointRadius: weightLogs.length > 60 ? 0 : 3,
      },
      {
        label: "Trend",
        data: weightLogs.map(w => {
          const t = trendByDate.get(w.logged_date);
          return t != null ? Math.round(fromKg(t, weightUnit) * 10) / 10 : null;
        }),
        borderColor: WATER_BLUE,
        backgroundColor: "transparent",
        fill: false,
        tension: 0.3,
        spanGaps: true,
        pointRadius: 0,
        borderWidth: 2,
      },
    ],
  };

  const chartOptions = {
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

  const sbIconBase = {
    width: 36, height: 36, display: "flex", alignItems: "center",
    justifyContent: "center", borderRadius: 8, cursor: "pointer",
    color: "var(--text-muted)", fontSize: 18,
  };

  return (
    <div style={{ display: "flex", height: "100vh", background: "var(--bg-primary)", fontFamily: "'Plus Jakarta Sans', sans-serif", color: "var(--text-primary)", overflow: "hidden" }}>

      <AppNav active="progress" initials={initials} />

      {/* ── main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* top bar */}
        <div className="page-pad-top" style={{ minHeight: 52, background: "var(--bg-primary)", borderBottom: "1px solid var(--border-default)", display: "flex", flexWrap: "wrap", alignItems: "center", paddingTop: 8, paddingBottom: 8, gap: 16, flexShrink: 0 }}>
          <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 600 }}>Progress</span>
          <div style={{ flex: 1 }} />
          <div style={{ ...sbIconBase, fontSize: 18 }} title="Notifications"><i className="ti ti-bell" /></div>
        </div>

        {/* scrollable content */}
        <div className="page-pad app-content-pad" style={{ flex: 1, overflowY: "auto" }}>

          {!hasData && !loading && (
            <div className="empty-state-row" style={{
              background: "var(--accent-bg)", border: "1px solid var(--border-active)",
              borderRadius: 12, padding: "28px 32px", marginBottom: 24,
            }}>
              <div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 6 }}>
                  Nothing to show yet in this range
                </div>
                <div style={{ fontSize: 14, color: "var(--text-muted)", maxWidth: 420, lineHeight: 1.6 }}>
                  Start logging meals and check in on mood in the dashboard — your charts, streaks, and trends will appear here as your data builds up.
                </div>
              </div>
              <button
                onClick={() => navigate("/dashboard")}
                style={{
                  background: "var(--accent)", border: "none", borderRadius: 8,
                  padding: "10px 22px", fontSize: 14, fontWeight: 600,
                  color: "#0f0f0f", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}
              >
                Go to dashboard
              </button>
            </div>
          )}

          {/* range toggle */}
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {RANGES.map(r => (
              <button key={r.id} onClick={() => setRange(r.id)} style={{
                background: range === r.id ? "var(--accent-bg)" : "var(--bg-card)",
                border: `1px solid ${range === r.id ? "var(--accent-dark)" : "var(--border-strong)"}`,
                borderRadius: 8, padding: "7px 18px", fontSize: 13,
                color: range === r.id ? "var(--accent)" : "var(--text-muted)", cursor: "pointer",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>{r.label}</button>
            ))}
          </div>

          {/* stat cards */}
          <div className="grid-4" style={{ marginBottom: 24 }}>
            <StatCard label="Avg. calories" value={hasData ? avgCalories.toLocaleString() : "—"} hint={hasData ? `over ${loggedDays.length} logged days` : "No data yet"} />
            <StatCard label="Days on target" value={hasData && calorieTarget ? daysOnTarget : "—"} hint={calorieTarget ? "within 10% of goal" : "Set a calorie target in Settings"} />
            <StatCard label="Avg. protein" value={hasData ? `${avgProtein}g` : "—"} hint={hasData ? `over ${loggedDays.length} logged days` : "No data yet"} />
            <StatCard label="Avg. energy" value={avgEnergy || "—"} hint={avgEnergy ? `over ${energyDays.length} check-ins` : "Check in on mood to unlock this"} />
          </div>

          {/* calendar */}
          <div style={{ marginBottom: 24 }}>
            <LogCalendar
              month={calMonth}
              byDate={calByDate}
              calorieTarget={calorieTarget}
              loading={calLoading}
              onPrevMonth={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              onNextMonth={() => canGoNextMonth && setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              canGoNext={canGoNextMonth}
              onSelectDay={(date) => navigate("/dashboard", { state: { date } })}
            />
          </div>

          {/* weight chart */}
          <div ref={weightSectionRef} style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 10 }}>Weight</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              <LogWeightButton unit={weightUnit} onLog={(w, u) => logWeight(today, w, u)} />
              <select
                value={weightRange}
                onChange={e => setWeightRange(e.target.value)}
                style={{
                  background: "var(--bg-primary)", border: "1px solid var(--border-default)",
                  borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "var(--text-primary)",
                  fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none", cursor: "pointer",
                }}
              >
                {WEIGHT_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            {weightCoachNote && <CoachNote note={weightCoachNote} onDismiss={dismissWeightCoachNote} style={{ marginBottom: 16 }} />}
            {weightLoading ? null : weightLogs.length > 1 ? (
              <div style={{ height: 220 }}><Line data={weightChartData} options={chartOptions} /></div>
            ) : (
              <EmptyChartBox icon="ti-scale" message="Log your weight above to see a trend here" />
            )}
          </div>

          {/* Estimated maintenance now lives on its own page (/expenditure)
              with real Average/Difference stats and a longer Pro-gated
              range picker — this used to duplicate that exact chart, so
              it's now just a handoff instead of a second copy. */}
          <div
            onClick={() => navigate("/expenditure")}
            style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
          >
            <div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 2 }}>Estimated maintenance</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>See how your true maintenance calories have moved over time</div>
            </div>
            <i className="ti ti-chevron-right" style={{ fontSize: 18, color: "var(--text-muted)" }} />
          </div>

          {/* bottom row */}
          <div className="grid-2">

            {/* streak badges */}
            <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 16 }}>Streak badges</div>
              {[
                { icon: "ti-flame",      iconBg: "var(--accent-bg)", iconColor: "var(--accent)",     name: "Logging streak",   count: loggingStreak },
                { icon: "ti-target",     iconBg: "var(--accent-bg)", iconColor: "var(--accent)",     name: "Calorie target",   count: calorieStreak },
                { icon: "ti-meat",       iconBg: WATER_BLUE + "18",  iconColor: "var(--water-blue)", name: "Protein target",   count: proteinStreak },
                { icon: "ti-mood-smile", iconBg: AI_PURPLE + "18",   iconColor: "var(--ai-purple)",  name: "Mood check-ins",   count: moodStreak },
              ].map((s, i, arr) => (
                <div key={s.name} style={{ borderBottom: i < arr.length - 1 ? "1px solid var(--border-default)" : "none" }}>
                  <StreakItem {...s} />
                </div>
              ))}
            </div>

            {/* weekly mini chart */}
            <div style={{ background: "var(--bg-subtle)", border: "1px solid var(--border-default)", borderRadius: 12, padding: 20 }}>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 8 }}>This week at a glance</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 16 }}>Calories logged each day</div>
              <WeekBars days={dateRange(dateNDaysAgo(6), today).map(date => byDate.get(date) || { date, calories: 0 })} calorieTarget={calorieTarget} />
              <div style={{ marginTop: 20, padding: "12px 14px", background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
                Green = within 15% of your target. Blue = logged but off target. Grey = nothing logged.
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyChartBox({ icon, message }) {
  return (
    <div style={{
      height: 180, border: "1px dashed var(--border-strong)", borderRadius: 8,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10,
    }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: "var(--border-strong)" }} />
      <div style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", maxWidth: 180 }}>{message}</div>
    </div>
  );
}

// The dashboard's weight tile also has its own quick-log popup
// (WeightLogModal in Dashboard.jsx) for logging without leaving that
// page — this button is the equivalent entry point for anyone already
// on Progress instead.
function LogWeightButton({ unit, onLog }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!value || saving) return;
    setSaving(true);
    try {
      await onLog(Number(value), unit);
      setValue("");
      setOpen(false);
    } catch (err) {
      console.error("Failed to log weight:", err);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{ background: "var(--accent-bg)", border: "1px solid var(--border-active)", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "var(--accent)", cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        + Log weight
      </button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <input
        type="number" autoFocus value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") submit(); if (e.key === "Escape") setOpen(false); }}
        placeholder={`Weight (${unit})`}
        style={{ width: 110, background: "var(--bg-card)", border: "1px solid var(--border-default)", borderRadius: 7, padding: "6px 10px", color: "var(--text-primary)", fontSize: 13, outline: "none", fontFamily: "inherit" }}
      />
      <button onClick={submit} disabled={!value || saving} style={{ background: !value || saving ? "var(--border-default)" : "var(--accent)", border: "none", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: !value || saving ? "var(--text-muted)" : "#0f0f0f", cursor: !value || saving ? "not-allowed" : "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {saving ? "Saving…" : "Save"}
      </button>
      <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--text-hint)", fontSize: 12, cursor: "pointer", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Cancel</button>
    </div>
  );
}
