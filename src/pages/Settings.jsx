import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useReminders } from '../hooks/useReminders';
import { useAdaptiveTarget } from '../hooks/useAdaptiveTarget';
import { pushSupported } from '../lib/pushNotifications';
import { supabase } from '../lib/supabase';
import { goalMacroSplits, calcCalories, buildTargets, splitFromGrams } from '../lib/calorieTargets';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { useClosingTransition } from '../hooks/useClosingTransition';
import { useTheme } from '../hooks/useTheme';
import { useMyTrainers } from '../hooks/useCoach';
import AppNav from '../components/AppNav';

// ─── Reusable bits ──────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border-default)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 18px' }}>
      {children}
    </p>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-default)' }}>
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Select({ value, onChange, options }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        padding: '9px 12px',
        background: 'var(--bg-primary)',
        border: '1px solid var(--border-default)',
        borderRadius: '8px',
        color: 'var(--text-primary)',
        fontSize: '14px',
        fontFamily: "'DM Sans', sans-serif",
        outline: 'none',
        cursor: 'pointer',
        minWidth: '160px',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      {options.map(o => {
        const sel = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: '1 1 auto',
              minWidth: '120px',
              padding: '14px 16px',
              background: sel ? 'var(--accent-bg)' : 'var(--bg-primary)',
              border: `1px solid ${sel ? 'var(--border-active)' : 'var(--border-default)'}`,
              borderRadius: '12px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
            }}
          >
            <i className={`ti ${o.icon}`} style={{ fontSize: '20px', marginBottom: '4px', display: 'block', color: sel ? 'var(--accent)' : 'var(--text-muted)' }} />
            <div style={{ color: sel ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '14px', fontWeight: 600, fontFamily: "'DM Sans', sans-serif" }}>{o.label}</div>
            {o.desc && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{o.desc}</div>}
          </button>
        );
      })}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: '44px', height: '26px',
        borderRadius: '99px',
        border: `1px solid ${on ? 'var(--accent-dark)' : 'var(--border-default)'}`,
        background: on ? '#4a7a4a33' : 'var(--bg-primary)',
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: '2px',
        left: on ? '20px' : '2px',
        width: '20px', height: '20px',
        borderRadius: '50%',
        background: on ? 'var(--accent)' : 'var(--text-muted)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

function Slider({ value, min, max, step = 1, onChange, color = 'var(--accent)' }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        width: '100%',
        appearance: 'none',
        WebkitAppearance: 'none',
        height: '6px',
        borderRadius: '99px',
        background: `linear-gradient(to right, ${color} ${pct}%, var(--border-default) ${pct}%)`,
        outline: 'none',
        cursor: 'pointer',
      }}
    />
  );
}

function MacroPreviewBar({ label, grams, calories, pct, color }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{grams}g</span> · {calories} kcal · {Math.round(pct * 100)}%
        </span>
      </div>
      <div style={{ height: '6px', background: 'var(--border-default)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct * 100}%`, background: color, borderRadius: '99px', transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

// Shows the adaptive-target estimate, or an honest explanation of what's
// still needed — mirrors the pattern engine's "log N more days" gating
// rather than silently falling back to a guess.
function AdaptiveTargetPanel({ loading, result, goal, onRefresh }) {
  if (loading) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 0 }}>Crunching your weight and food logs…</p>;
  }
  if (!result) {
    return <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 0 }}>—</p>;
  }
  if (!result.ready) {
    const messages = {
      'no-weight-logs': 'Log your weight from the dashboard to get started — adaptive targeting learns from your real weight trend over time.',
      'not-enough-span': `Keep logging weight — ${result.daysNeeded} more day${result.daysNeeded === 1 ? '' : 's'} of spread before there's enough of a trend to work from.`,
      'not-enough-logged-days': `Log food on ${result.daysNeeded} more day${result.daysNeeded === 1 ? '' : 's'} within your weight-logging window — the estimate needs to see what you're actually eating, not just the scale.`,
    };
    return (
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 10px' }}>
          {messages[result.reason] || 'Not enough data yet to estimate this.'}
        </p>
        <p style={{ color: 'var(--text-hint)', fontSize: '11px', margin: 0 }}>
          Until then, this uses your Calculated target as a placeholder.
        </p>
      </div>
    );
  }
  const { estimate } = result;
  const trendDirection = estimate.weightChangeKg > 0 ? 'up' : estimate.weightChangeKg < 0 ? 'down' : 'flat';
  const goalLabel = { lose: 'Lose weight', maintain: 'Stay balanced', build: 'Build muscle' }[goal] || 'your goal';
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 8px' }}>
        Estimated maintenance: <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{estimate.tdee.toLocaleString()} kcal</span>, from your trend weight going {trendDirection} {Math.abs(estimate.weightChangeKg)}kg
        over {estimate.spanDays} days while averaging {estimate.avgCalIn.toLocaleString()} kcal/day ({estimate.loggedDayCount} logged days).
        Adjusted for your "{goalLabel}" goal to {result.target.toLocaleString()} kcal — this updates as you keep logging.
      </p>
      <button
        onClick={onRefresh}
        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '5px 12px', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
      >
        Recalculate
      </button>
    </div>
  );
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'goals',    label: 'Goals & Targets' },
  { id: 'notifs',   label: 'Notifications' },
  { id: 'coach',    label: 'Coach Mode' },
  { id: 'account',  label: 'Account' },
];

const DEFAULT_FORM = { unit: 'metric', age: 30, weight: 70, height: 170, goal: 'maintain', activity: 'moderate' };

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const reminders = useReminders();
  const [reminderTimeInput, setReminderTimeInput] = useState(reminders.time);
  const [reminderError, setReminderError] = useState(null);
  const { trainers, loading: trainersLoading, redeemCode, disconnect } = useMyTrainers();
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [inviteStatus, setInviteStatus] = useState(null); // null | 'loading' | error string
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  const [tab, setTab] = useState('goals');
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [calMode, setCalMode] = useState('calculated');
  const [customCal, setCustomCal] = useState(2000);
  const [proteinPct, setProteinPct] = useState(30);
  const [fatPct, setFatPct] = useState(30);
  // Pro-only custom micronutrient targets. Kept as strings (not numbers)
  // so an input can sit genuinely empty — a nutrient absent here means
  // "use the default guideline" (see Nutrients.jsx's MicroCard), not "0".
  const [microTargets, setMicroTargets] = useState({});

  // Baseline snapshot of the goals-tab draft fields as of the last
  // profile sync (initial load, or right after a save resolves and
  // profile updates) — comparing the live draft against this is what
  // drives the "unsaved changes" popup, replacing the old always-visible
  // top Save button.
  const [baseline, setBaseline] = useState(null);
  const isDirty = !!baseline && (
    form.unit !== baseline.unit || Number(form.age) !== baseline.age ||
    Number(form.weight) !== baseline.weight || Number(form.height) !== baseline.height ||
    form.goal !== baseline.goal || form.activity !== baseline.activity ||
    calMode !== baseline.calMode || customCal !== baseline.customCal ||
    proteinPct !== baseline.proteinPct || fatPct !== baseline.fatPct ||
    JSON.stringify(microTargets) !== JSON.stringify(baseline.microTargets)
  );
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupClosing, setPopupClosing] = useState(false);
  useEffect(() => {
    if (isDirty) {
      setPopupClosing(false);
      setPopupVisible(true);
      return;
    }
    if (!popupVisible) return;
    setPopupClosing(true);
    const t = setTimeout(() => { setPopupVisible(false); setPopupClosing(false); }, 160);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty]);

  const { compute: computeAdaptive } = useAdaptiveTarget();
  const [adaptiveResult, setAdaptiveResult] = useState(null);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);

  const refreshAdaptive = async (goal) => {
    setAdaptiveLoading(true);
    try {
      setAdaptiveResult(await computeAdaptive(goal));
    } finally {
      setAdaptiveLoading(false);
    }
  };

  // Sync form state once the real profile loads — also snapshots the
  // same values into `baseline`, since this runs again right after a
  // save resolves (saveProfile updates the profile this hook reads), at
  // which point draft and baseline naturally converge and the popup
  // disappears without handleSave needing to touch baseline itself.
  useEffect(() => {
    if (!profile) return;
    const syncedForm = {
      unit: profile.unit || 'metric',
      age: profile.age || 30,
      weight: profile.weight || 70,
      height: profile.height || 170,
      goal: profile.goal || 'maintain',
      activity: profile.activity || 'moderate',
    };
    setForm(syncedForm);
    let syncedCal = customCal, syncedProtein = proteinPct, syncedFat = fatPct;
    if (profile.calorie_target) {
      syncedCal = profile.calorie_target;
      const split = splitFromGrams(profile.protein_g || 0, profile.carbs_g || 0, profile.fat_g || 0);
      syncedProtein = Math.round(split.protein * 100);
      syncedFat = Math.round(split.fat * 100);
      setCustomCal(syncedCal);
      setProteinPct(syncedProtein);
      setFatPct(syncedFat);
    }
    let syncedMode = calMode;
    if (profile.calorie_mode) {
      syncedMode = profile.calorie_mode;
      setCalMode(syncedMode);
      if (syncedMode === 'adaptive') refreshAdaptive(profile.goal || 'maintain');
    }
    if (profile.reminder_time) setReminderTimeInput(profile.reminder_time);
    const syncedMicroTargets = Object.fromEntries(
      Object.entries(profile.micro_targets || {}).map(([k, v]) => [k, String(v)])
    );
    setMicroTargets(syncedMicroTargets);
    setBaseline({
      ...syncedForm, age: Number(syncedForm.age), weight: Number(syncedForm.weight), height: Number(syncedForm.height),
      calMode: syncedMode, customCal: syncedCal, proteinPct: syncedProtein, fatPct: syncedFat,
      microTargets: syncedMicroTargets,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const carbPct = Math.max(0, 100 - proteinPct - fatPct);

  // Live calorie + macro preview. Adaptive falls back to the calculated
  // formula while the real estimate is loading or isn't ready yet, so
  // the rest of the page (macro split, save button) always has a sane
  // number to work with instead of needing its own separate null-state.
  const calculatedCal = calcCalories(form);
  const calories = calMode === 'calculated' ? calculatedCal
    : calMode === 'adaptive' ? (adaptiveResult?.ready ? adaptiveResult.target : calculatedCal)
    : customCal;
  const split = { protein: proteinPct / 100, carbs: carbPct / 100, fat: fatPct / 100 };
  const preview = buildTargets(calories, split, profile?.water_target || 8);

  // When goal changes, snap macros to that goal's recommended split. In
  // adaptive mode the goal also changes the target itself (same TDEE
  // estimate, different deficit/surplus adjustment), so re-run it —
  // otherwise the displayed target would silently keep the old goal's
  // number until the next unrelated refresh.
  const applyGoalSplit = (goal) => {
    set('goal', goal);
    const s = goalMacroSplits[goal];
    setProteinPct(Math.round(s.protein * 100));
    setFatPct(Math.round(s.fat * 100));
    if (calMode === 'adaptive') refreshAdaptive(goal);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Drop empty/invalid entries so clearing an input actually removes
      // the target (falls back to the default guideline) instead of
      // saving it as 0 or "".
      const cleanedMicroTargets = Object.fromEntries(
        Object.entries(microTargets)
          .map(([k, v]) => [k, Number(v)])
          .filter(([, v]) => Number.isFinite(v) && v > 0)
      );
      await saveProfile({
        unit: form.unit,
        age: Number(form.age),
        weight: Number(form.weight),
        height: Number(form.height),
        goal: form.goal,
        activity: form.activity,
        calorie_mode: calMode,
        calorie_target: preview.calories,
        protein_g: preview.protein.g,
        carbs_g: preview.carbs.g,
        fat_g: preview.fat.g,
        water_target: preview.water,
        micro_targets: cleanedMicroTargets,
      });
      // No need to touch popup state here — saveProfile updates `profile`,
      // which re-runs the sync effect above and refreshes `baseline` to
      // match the just-saved draft, so isDirty (and the popup) clears on
      // its own the moment the new profile lands.
    } finally {
      setSaving(false);
    }
  };

  const handleRedeemCode = async () => {
    const code = inviteCodeInput.trim();
    if (!code) return;
    setInviteStatus('loading');
    try {
      await redeemCode(code);
      setInviteCodeInput('');
      setInviteStatus(null);
    } catch (err) {
      setInviteStatus(err.message || "Couldn't connect — check the code and try again.");
    }
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { closing: logoutConfirmClosing, close: closeLogoutConfirm } = useClosingTransition(() => setShowLogoutConfirm(false));

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  // Guest sessions have no password — Supabase signs them out permanently,
  // with no way back in, unlike a real account where "log out" is safe and
  // reversible. Guard the button with an explicit warning instead of
  // treating it the same as a real account's logout.
  const requestLogout = () => {
    if (isGuest) setShowLogoutConfirm(true);
    else handleLogout();
  };

  const isGuest = !!user?.is_anonymous;
  const daysRemaining = user?.created_at
    ? Math.max(0, 7 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
    : 7;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'DM Sans', sans-serif" }}>
      <AppNav active="settings" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Top bar */}
        <div className="page-pad-top" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px',
          paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
        }}>
          <div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Settings
            </h2>
            <p style={{ color: 'var(--text-hint)', fontSize: '13px', margin: '2px 0 0' }}>Manage your goals, profile and preferences</p>
          </div>
        </div>

        {/* Profile preview — tap through to the full Profile page */}
        <div className="page-pad-top" style={{ paddingTop: 16 }}>
          <button
            onClick={() => navigate('/profile')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '14px',
              padding: '14px 16px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
              borderRadius: '14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
          >
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'var(--accent-bg)', border: '1px solid var(--accent-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 17, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
              fontFamily: "'Syne', sans-serif",
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text-primary)', fontSize: '15px', fontWeight: 600 }}>{profile?.name || 'Your name'}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '2px' }}>
                {isGuest ? `Guest mode · ${daysRemaining} days left` : (user?.email || 'View profile')}
              </div>
            </div>
            <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16, flexShrink: 0 }} />
          </button>
        </div>

        {/* Tabs — touchAction/overscrollBehavior constrain this row to
            horizontal-only: without them, a drag here can read as a
            vertical gesture too and bounce the whole page diagonally
            (iOS's scroll-chaining kicking in once the horizontal scroll
            hits its own edge), instead of staying contained to this row. */}
        <div className="page-pad-top" style={{ display: 'flex', gap: '4px', overflowX: 'auto', touchAction: 'pan-x', overscrollBehaviorX: 'contain', paddingTop: 16, borderBottom: '1px solid var(--border-default)' }}>
          {TABS.map(t => {
            const sel = tab === t.id;
            return (
              <button
                // Keyed on selection state, not just id — iOS Safari has a
                // known bug where a border-bottom on a child of an
                // overflow-x:auto flex row doesn't repaint on a style-only
                // change, leaving the previous tab's underline stuck on
                // screen. Changing the key forces React to tear down and
                // recreate the button whenever its selected state flips,
                // which sidesteps the stale paint instead of hoping a
                // repaint happens on its own.
                key={`${t.id}-${sel}`}
                onClick={() => setTab(t.id)}
                style={{
                  padding: '10px 14px',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: `2px solid ${sel ? 'var(--accent)' : 'transparent'}`,
                  color: sel ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '14px',
                  fontWeight: sel ? 600 : 400,
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                  marginBottom: '-1px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  transform: 'translateZ(0)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="page-pad">

          {/* ── GOALS & TARGETS ── */}
          {tab === 'goals' && (
            <>
              <Card>
                <SectionLabel>Goal</SectionLabel>
                <Segmented
                  value={form.goal}
                  onChange={applyGoalSplit}
                  options={[
                    { value: 'lose',     icon: 'ti-trending-down', label: 'Lose weight',  desc: '−400 kcal/day' },
                    { value: 'maintain', icon: 'ti-scale',         label: 'Maintain',     desc: 'At maintenance' },
                    { value: 'build',    icon: 'ti-barbell',       label: 'Build muscle', desc: '+300 kcal/day' },
                  ]}
                />
                <div style={{ marginTop: '16px' }}>
                  <FieldRow label="Activity level" hint="Used to estimate your daily energy use">
                    <Select
                      value={form.activity}
                      onChange={v => set('activity', v)}
                      options={[
                        { value: 'sedentary', label: 'Sedentary' },
                        { value: 'light',     label: 'Lightly active' },
                        { value: 'moderate',  label: 'Moderately active' },
                        { value: 'very',      label: 'Very active' },
                      ]}
                    />
                  </FieldRow>
                </div>
              </Card>

              <div className="grid-2" style={{ alignItems: 'start' }}>

              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Calorie target</SectionLabel>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
                  {[
                    { value: 'calculated', label: 'Calculated' },
                    { value: 'custom',     label: 'Custom' },
                    { value: 'adaptive',   label: 'Adaptive' },
                  ].map(m => {
                    const sel = calMode === m.value;
                    return (
                      <button
                        key={m.value}
                        onClick={() => {
                          setCalMode(m.value);
                          if (m.value === 'custom') setCustomCal(calculatedCal);
                          if (m.value === 'adaptive' && !adaptiveResult) refreshAdaptive(form.goal);
                        }}
                        style={{
                          flex: 1, padding: '10px',
                          background: sel ? 'var(--accent-bg)' : 'var(--bg-primary)',
                          border: `1px solid ${sel ? 'var(--border-active)' : 'var(--border-default)'}`,
                          borderRadius: '8px',
                          color: sel ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                          fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontSize: '40px', fontWeight: 700, color: 'var(--accent)' }}>
                    {calories.toLocaleString()}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px', marginLeft: '6px' }}>kcal / day</span>
                </div>

                {calMode === 'custom' ? (
                  <>
                    <Slider value={customCal} min={1200} max={4000} step={10} onChange={setCustomCal} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-hint)', fontSize: '11px', marginTop: '6px' }}>
                      <span>1,200</span><span>4,000</span>
                    </div>
                  </>
                ) : calMode === 'adaptive' ? (
                  <AdaptiveTargetPanel loading={adaptiveLoading} result={adaptiveResult} goal={form.goal} onRefresh={() => refreshAdaptive(form.goal)} />
                ) : (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 0 }}>
                    Calculated from your stats, goal and activity level. Switch to Custom to set it manually.
                  </p>
                )}
              </Card>

              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Macro split</SectionLabel>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>Protein</span>
                    <span style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600 }}>{proteinPct}%</span>
                  </div>
                  <Slider value={proteinPct} min={10} max={60} onChange={v => setProteinPct(Math.min(v, 100 - fatPct))} color="var(--accent)" />
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>Fat</span>
                    <span style={{ color: 'var(--ai-purple)', fontSize: '13px', fontWeight: 600 }}>{fatPct}%</span>
                  </div>
                  <Slider value={fatPct} min={10} max={50} onChange={v => setFatPct(Math.min(v, 100 - proteinPct))} color="var(--ai-purple)" />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>Carbs</span>
                    <span style={{ color: 'var(--water-blue)', fontSize: '13px', fontWeight: 600 }}>{carbPct}% (auto)</span>
                  </div>
                  <div style={{ height: '6px', background: 'var(--border-default)', borderRadius: '99px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${carbPct}%`, background: 'var(--water-blue)', borderRadius: '99px', transition: 'width 0.2s' }} />
                  </div>
                  <p style={{ color: 'var(--text-hint)', fontSize: '11px', marginTop: '6px' }}>Carbs fill whatever's left so your split always totals 100%.</p>
                </div>

                {/* Live preview */}
                <div style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: '12px', padding: '18px' }}>
                  <p style={{ color: 'var(--accent-dark)', fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 14px' }}>
                    Daily breakdown
                  </p>
                  <MacroPreviewBar label="Protein" grams={preview.protein.g} calories={preview.protein.cal} pct={preview.protein.pct} color="var(--accent)" />
                  <MacroPreviewBar label="Carbs"   grams={preview.carbs.g}   calories={preview.carbs.cal}   pct={preview.carbs.pct}   color="var(--water-blue)" />
                  <MacroPreviewBar label="Fat"     grams={preview.fat.g}     calories={preview.fat.cal}     pct={preview.fat.pct}     color="var(--ai-purple)" />
                </div>
              </Card>

              </div>

              <Card>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <SectionLabel>Micronutrient targets</SectionLabel>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
                </div>
                {!profile?.is_premium ? (
                  <div style={{ position: 'relative' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none' }}>
                      {MICRO_NUTRIENTS.slice(0, 6).map(n => (
                        <div key={n.key} style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>{n.label}</div>
                          <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>—{n.unit}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: 20 }}>
                      <i className="ti ti-lock" style={{ fontSize: 20, color: 'var(--accent)' }} />
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 340 }}>
                        Set your own target for every nutrient on the Nutrients page instead of the default guideline — Pro only.
                      </p>
                      <button
                        onClick={() => setTab('account')}
                        style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                      >
                        Upgrade to Pro
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 16px' }}>
                      Leave a field blank to use the default guideline instead.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                      {MICRO_NUTRIENTS.map(n => (
                        <div key={n.key}>
                          <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 5, display: 'block' }}>{n.label}</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type="number"
                              min="0"
                              inputMode="decimal"
                              value={microTargets[n.key] ?? ''}
                              onChange={e => setMicroTargets(t => ({ ...t, [n.key]: e.target.value }))}
                              placeholder="Default"
                              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px 10px', color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                            />
                            <span style={{ fontSize: 12, color: 'var(--text-hint)', flexShrink: 0 }}>{n.unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </>
          )}

          {/* ── NOTIFICATIONS ── */}
          {tab === 'notifs' && (
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Reminders</SectionLabel>
                <FieldRow label="Daily reminder" hint={reminders.enabled ? `Nudges you at ${reminderTimeInput} if you haven't logged anything yet` : "Nudge to log food if you haven't yet"}>
                  <Toggle
                    on={reminders.enabled}
                    onChange={async (on) => {
                      setReminderError(null);
                      try {
                        if (on) await reminders.enable(reminderTimeInput);
                        else await reminders.disable();
                      } catch (err) {
                        setReminderError(err.message || "Couldn't update reminders — try again.");
                      }
                    }}
                  />
                </FieldRow>
                {reminders.enabled && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '-4px', marginBottom: '16px' }}>
                    <input
                      type="time"
                      value={reminderTimeInput}
                      onChange={async (e) => {
                        setReminderTimeInput(e.target.value);
                        try { await reminders.setTime(e.target.value); } catch { setReminderError("Couldn't save the new time — try again."); }
                      }}
                      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
                    />
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Time in your device's local timezone</span>
                  </div>
                )}
                {!pushSupported() && (
                  <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>Push notifications aren't supported in this browser.</p>
                )}
                {reminderError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>{reminderError}</p>}
                {[
                  { key: 'water', label: 'Water reminders',     hint: 'Gentle reminders to stay hydrated — coming soon' },
                  { key: 'mood',  label: 'Daily mood check-in', hint: 'One tap each evening — coming soon' },
                ].map(n => (
                  <FieldRow key={n.key} label={n.label} hint={n.hint}>
                    <Toggle on={false} onChange={() => {}} />
                  </FieldRow>
                ))}
              </Card>

              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Updates</SectionLabel>
                {[
                  { key: 'recap',   label: 'Weekly recap',    hint: 'Your shareable Sunday summary — coming soon' },
                  { key: 'ai',      label: 'Pattern insights', hint: 'Nudges based on your logged patterns — coming soon' },
                  { key: 'trainer', label: 'Trainer updates', hint: 'When your trainer comments on your data — coming soon' },
                ].map(n => (
                  <FieldRow key={n.key} label={n.label} hint={n.hint}>
                    <Toggle on={false} onChange={() => {}} />
                  </FieldRow>
                ))}
              </Card>
            </div>
          )}

          {/* ── COACH MODE ── */}
          {tab === 'coach' && (
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Become a coach</SectionLabel>
                <FieldRow label="Coach Pass" hint="Test toggle — real billing isn't wired up yet">
                  <Toggle
                    on={!!profile?.coach_pass}
                    onChange={(on) => saveProfile(on ? { coach_pass: true } : { coach_pass: false, coach_mode: false })}
                  />
                </FieldRow>
                <FieldRow label="Coach Mode" hint={profile?.coach_pass ? 'See your clients’ logged data and leave comments' : 'Requires Coach Pass'}>
                  <Toggle
                    on={!!profile?.coach_mode}
                    onChange={async (on) => {
                      if (!profile?.coach_pass) return;
                      await saveProfile({ coach_mode: on });
                      navigate(on ? '/coach' : '/dashboard');
                    }}
                  />
                </FieldRow>
                {profile?.coach_mode && (
                  <button
                    onClick={() => navigate('/coach')}
                    style={{ marginTop: 16, padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#0f0f0f', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                  >
                    Open Coach Dashboard
                  </button>
                )}
              </Card>

              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>My trainer</SectionLabel>
                {trainersLoading ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
                ) : trainers.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>Not connected to a trainer yet.</p>
                ) : (
                  trainers.map(row => (
                    <FieldRow key={row.id} label={row.trainer?.name || 'Trainer'} hint={`Connected ${new Date(row.created_at).toLocaleDateString()}`}>
                      <button
                        onClick={() => disconnect(row.id)}
                        style={{ padding: '7px 12px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 7, color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                      >
                        Disconnect
                      </button>
                    </FieldRow>
                  ))
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <input
                    value={inviteCodeInput}
                    onChange={e => { setInviteCodeInput(e.target.value.toUpperCase()); setInviteStatus(null); }}
                    placeholder="Enter invite code"
                    style={{ flex: 1, padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', outline: 'none', textTransform: 'uppercase' }}
                  />
                  <button
                    onClick={handleRedeemCode}
                    disabled={!inviteCodeInput.trim() || inviteStatus === 'loading'}
                    style={{ padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", flexShrink: 0 }}
                  >
                    {inviteStatus === 'loading' ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
                {inviteStatus && inviteStatus !== 'loading' && (
                  <p style={{ color: 'var(--danger)', fontSize: 12, margin: '8px 0 0' }}>{inviteStatus}</p>
                )}
              </Card>
            </div>
          )}

          {/* ── ACCOUNT ── */}
          {tab === 'account' && (
            <div className="grid-2" style={{ alignItems: 'start' }}>
              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Account</SectionLabel>
                <FieldRow label="Status" hint={isGuest ? `Guest mode · ${daysRemaining} days left` : 'Signed in'}>
                  {!isGuest && <span style={{ color: 'var(--accent)', fontSize: '13px' }}>{user?.email}</span>}
                </FieldRow>
                {isGuest && <UpgradeForm />}
                {isGuest && (
                  <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '16px 0 0' }}>
                    Already have an account?{' '}
                    <span onClick={() => navigate('/login')} style={{ color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>
                      Log in instead
                    </span>{' '}— this guest session's data will be left behind unless you upgrade it first.
                  </p>
                )}
                <FieldRow label="Pro features" hint="Test toggle — real billing isn't wired up yet">
                  <Toggle on={!!profile?.is_premium} onChange={(on) => saveProfile({ is_premium: on })} />
                </FieldRow>
                <button
                  onClick={requestLogout}
                  style={{
                    marginTop: '16px',
                    padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)',
                    borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
                    cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  {isGuest ? 'Exit guest session' : 'Log out'}
                </button>
              </Card>

              <Card style={{ marginBottom: 0 }}>
                <SectionLabel>Appearance</SectionLabel>
                <FieldRow label="Theme" hint={theme === 'light' ? 'Light — matches most of the day' : 'Dark — easier on the eyes at night'}>
                  <div style={{ display: 'flex', gap: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2 }}>
                    {[{ id: 'dark', label: 'Dark', icon: 'ti-moon' }, { id: 'light', label: 'Light', icon: 'ti-sun' }].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setTheme(opt.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 18, border: 'none',
                          background: theme === opt.id ? 'var(--accent)' : 'transparent',
                          color: theme === opt.id ? '#0f0f0f' : 'var(--text-muted)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        <i className={`ti ${opt.icon}`} style={{ fontSize: 14 }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </FieldRow>
              </Card>
            </div>
          )}

          {/* Required FatSecret Platform API attribution — must not be
              reworded per their attribution policy. Settings is the one
              screen every user always has access to, so it lives here now
              that the marketing Landing page (its previous home) is gone. */}
          <div className="page-pad-top" style={{ textAlign: 'center', paddingTop: 24, paddingBottom: 8 }}>
            <a href="https://platform.fatsecret.com" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-hint)' }}>
              Powered by fatsecret Platform API
            </a>
            <div style={{ marginTop: 8 }}>
              <a href="/terms" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-hint)' }}>Terms of Service</a>
              <span style={{ fontSize: 11, color: 'var(--text-hint)', margin: '0 8px' }}>·</span>
              <a href="/privacy" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--text-hint)' }}>Privacy Policy</a>
            </div>
          </div>
        </div>
      </div>

      {showLogoutConfirm && (
        <div onClick={closeLogoutConfirm} className={`modal-backdrop${logoutConfirmClosing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
          <div onClick={e => e.stopPropagation()} className={`modal-panel${logoutConfirmClosing ? ' is-closing' : ''}`} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, width: '100%', maxWidth: 420, padding: 24 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', marginBottom: 10 }}>
              Exit guest session?
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
              You're in guest mode. Guest accounts have no password, so once you exit there's no way to log back into this data — it's gone for good. Create a real account above first if you want to keep it.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={closeLogoutConfirm}
                style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                style={{ flex: 1, padding: '11px', background: '#3a1414', border: '1px solid #6a2a2a', borderRadius: 8, color: '#e89f9f', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
              >
                Exit anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {popupVisible && (
        <div
          className={popupClosing ? 'toast-out' : 'toast-in'}
          style={{
            position: 'fixed', left: '50%', bottom: 84, zIndex: 150,
            width: 'calc(100% - 32px)', maxWidth: 420,
            background: 'var(--bg-subtle)', border: '1px solid var(--border-strong)', borderRadius: 14,
            padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Unsaved changes</span>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '9px 18px', background: saving ? 'var(--border-default)' : 'var(--accent)',
              border: 'none', borderRadius: 8, color: saving ? 'var(--text-muted)' : '#0f0f0f',
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Upgrade guest → real account ────────────────────────────────────────────
function UpgradeForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [status, setStatus] = useState(null); // null | 'loading' | 'done' | error string

  async function handleUpgrade() {
    if (!email || password.length < 8) return;
    setStatus('loading');
    const { error } = await supabase.auth.updateUser({ email, password });
    if (error) { setStatus(error.message); return; }
    setStatus('done');
  }

  if (status === 'done') {
    return (
      <p style={{ color: 'var(--accent)', fontSize: '13px', margin: '14px 0 0' }}>
        Almost there — check your email to confirm the address, then you're a full account with all your guest data intact.
      </p>
    );
  }

  return (
    <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 6px' }}>Upgrade to a real account — keeps everything you've logged so far.</p>
      <input
        type="email" placeholder="Email address" value={email}
        onChange={e => setEmail(e.target.value)}
        style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
      />
      <input
        type="password" placeholder="Password (min. 8 characters)" value={password}
        onChange={e => setPassword(e.target.value)}
        style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '13px', fontFamily: "'DM Sans', sans-serif", outline: 'none' }}
      />
      {status && status !== 'loading' && <span style={{ color: 'var(--danger)', fontSize: '12px' }}>{status}</span>}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, cursor: 'pointer', marginTop: '4px' }}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={e => setAgreed(e.target.checked)}
          style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)' }}
        />
        <span>
          I agree to the{' '}
          <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Terms of Service</a>
          {' '}and{' '}
          <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Privacy Policy</a>
        </span>
      </label>
      <button
        onClick={handleUpgrade}
        disabled={!email || password.length < 8 || status === 'loading' || !agreed}
        style={{
          padding: '9px 16px', background: 'var(--accent)', border: '1px solid var(--accent)',
          borderRadius: '8px', color: '#0f0f0f', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginTop: '4px',
        }}
      >
        {status === 'loading' ? 'Upgrading…' : 'Create account'}
      </button>
    </div>
  );
}
