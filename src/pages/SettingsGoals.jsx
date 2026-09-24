import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { useAdaptiveTarget } from '../hooks/useAdaptiveTarget';
import { goalMacroSplits, calcCalories, buildTargets, splitFromGrams } from '../lib/calorieTargets';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { dayTargetsToInputs, parseDayTargetInputs } from '../lib/dayTargets';
import RestDayTargetsCard from '../components/settings/RestDayTargetsCard';
import AppNav from '../components/AppNav';
import Slider from '../components/Slider';
import EditableNumber from '../components/EditableNumber';
import MacroPreviewBar from '../components/MacroPreviewBar';
import { Card, SectionLabel, FieldRow, Select, Segmented } from '../components/settings/primitives';
import { authedPost } from '../lib/billing';
import PageHeader from '../components/PageHeader';

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
        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '5px 12px', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        Recalculate
      </button>
    </div>
  );
}

// Starts checkout right from the paywall instead of sending the tap back
// to Settings just to find the same button again on the Profile page.
function UpgradeProButton({ pendingConfirmation, onGoToProfile }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      const { url } = await authedPost('/api/create-checkout-session', { plan: 'pro' });
      window.location.href = url;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Signup is already real at this point (RequireAuth's isUnsignedGuest
  // gate is the only thing standing between "browsing" and "has an
  // account" now) but unconfirmed — a subscription started now would
  // still be tied to a session that depends on that confirmation
  // completing. Send them to confirm it first instead of letting the
  // click reach checkout and bounce off the server-side block.
  if (pendingConfirmation) {
    return (
      <button
        onClick={onGoToProfile}
        style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        Confirm your email to unlock Pro
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: loading ? 'default' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {loading ? 'Loading…' : 'Upgrade to Pro'}
      </button>
      {error && <span style={{ color: 'var(--danger)', fontSize: 11 }}>{error}</span>}
    </div>
  );
}

const DEFAULT_FORM = { unit: 'metric', age: 30, weight: 70, height: 170, goal: 'maintain', activity: 'moderate' };

export default function SettingsGoals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  // RequireAuth's isUnsignedGuest gate means is_anonymous here can only
  // mean "signed up, hasn't confirmed their email yet" — never "browsing
  // without an account".
  const pendingConfirmation = !!user?.is_anonymous;
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
  // Optional rest-day targets + training weekdays (strings, like microTargets,
  // so a field can sit genuinely empty). Only offered once the database has the
  // columns — an un-updated profile row simply has no such field.
  const supportsDay = !!profile && 'rest_day_targets' in profile;
  const [restDay, setRestDay] = useState({ inputs: dayTargetsToInputs(null).inputs, trainingDays: [] });
  const [dayError, setDayError] = useState(null);

  // Baseline snapshot of the draft fields as of the last profile sync
  // (initial load, or right after a save resolves and profile updates) —
  // comparing the live draft against this is what drives the "unsaved
  // changes" popup, instead of an always-visible top Save button.
  const [baseline, setBaseline] = useState(null);
  const isDirty = !!baseline && (
    form.unit !== baseline.unit || Number(form.age) !== baseline.age ||
    Number(form.weight) !== baseline.weight || Number(form.height) !== baseline.height ||
    form.goal !== baseline.goal || form.activity !== baseline.activity ||
    calMode !== baseline.calMode || customCal !== baseline.customCal ||
    proteinPct !== baseline.proteinPct || fatPct !== baseline.fatPct ||
    JSON.stringify(microTargets) !== JSON.stringify(baseline.microTargets) ||
    JSON.stringify(restDay) !== JSON.stringify(baseline.restDay)
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
    const syncedMicroTargets = Object.fromEntries(
      Object.entries(profile.micro_targets || {}).map(([k, v]) => [k, String(v)])
    );
    setMicroTargets(syncedMicroTargets);
    const syncedRestDay = { inputs: dayTargetsToInputs(profile).inputs, trainingDays: dayTargetsToInputs(profile).trainingDays };
    setRestDay(syncedRestDay);
    setDayError(null);
    setBaseline({
      ...syncedForm, age: Number(syncedForm.age), weight: Number(syncedForm.weight), height: Number(syncedForm.height),
      calMode: syncedMode, customCal: syncedCal, proteinPct: syncedProtein, fatPct: syncedFat,
      microTargets: syncedMicroTargets,
      restDay: syncedRestDay,
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
    // Rest-day targets: validated up front so a typo is reported before anything
    // is saved. Adaptive mode can't have them (it rewrites the everyday numbers
    // itself), so saving in that mode turns them off.
    let dayFields = {};
    if (supportsDay) {
      if (calMode === 'adaptive') {
        dayFields = { rest_day_targets: null, training_days: null };
      } else {
        const parsed = parseDayTargetInputs(restDay.inputs, restDay.trainingDays);
        if (parsed.error) { setDayError(parsed.error); return; }
        dayFields = { rest_day_targets: parsed.rest, training_days: parsed.trainingDays };
      }
    }
    setDayError(null);
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
        ...dayFields,
      });
      // No need to touch popup state here — saveProfile updates `profile`,
      // which re-runs the sync effect above and refreshes `baseline` to
      // match the just-saved draft, so isDirty (and the popup) clears on
      // its own the moment the new profile lands.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="settings" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Goals & Targets" onBack={() => navigate('/settings')} backLabel="Back to Settings" />

        <div className="page-pad">
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
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              {calMode === 'custom' ? (
                <EditableNumber
                  value={customCal}
                  min={1200}
                  max={4000}
                  onChange={setCustomCal}
                  ariaLabel="Calorie target"
                  style={{ fontFamily: "'Syne', sans-serif", fontSize: '40px', fontWeight: 700, color: 'var(--accent)', width: '5.5ch' }}
                />
              ) : (
                <span style={{ fontFamily: "'Syne', sans-serif", fontSize: '40px', fontWeight: 700, color: 'var(--accent)' }}>
                  {calories.toLocaleString()}
                </span>
              )}
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
                <EditableNumber
                  value={proteinPct}
                  min={10}
                  max={60}
                  suffix="%"
                  onChange={v => setProteinPct(Math.min(v, 100 - fatPct))}
                  ariaLabel="Protein percent of calories"
                  style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600, width: '3.5ch' }}
                />
              </div>
              <Slider value={proteinPct} min={10} max={60} onChange={v => setProteinPct(Math.min(v, 100 - fatPct))} color="var(--accent)" />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500 }}>Fat</span>
                <EditableNumber
                  value={fatPct}
                  min={10}
                  max={50}
                  suffix="%"
                  onChange={v => setFatPct(Math.min(v, 100 - proteinPct))}
                  ariaLabel="Fat percent of calories"
                  style={{ color: 'var(--ai-purple)', fontSize: '13px', fontWeight: 600, width: '3.5ch' }}
                />
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

          {supportsDay && (
            <RestDayTargetsCard
              inputs={restDay.inputs}
              trainingDays={restDay.trainingDays}
              onChange={(update) => { setRestDay(update); setDayError(null); }}
              baseTargets={{ calories: preview.calories, protein_g: preview.protein.g, carbs_g: preview.carbs.g, fat_g: preview.fat.g }}
              adaptive={calMode === 'adaptive'}
              error={dayError}
            />
          )}

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
                  <UpgradeProButton pendingConfirmation={pendingConfirmation} onGoToProfile={() => navigate('/profile')} />
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
        </div>
      </div>

      {popupVisible && (
        <div
          className={popupClosing ? 'toast-out' : 'toast-in'}
          style={{
            // Plain `bottom: 84` sits 84px above the real (layout-viewport)
            // bottom edge — behind the keyboard once one's open, since
            // that edge doesn't move even though the keyboard now covers
            // it. This is the only Save affordance on a page that's all
            // numeric goal inputs, so it's reachable behind the keyboard
            // on every single edit otherwise. Adding back the keyboard's
            // own height (100vh minus the shrunk --vvh) keeps it 84px
            // above the *visible* bottom — the keyboard's top edge —
            // instead, and is a no-op (adds 0) when no keyboard is open.
            position: 'fixed', left: '50%', bottom: 'calc(84px + (100vh - var(--vvh, 100vh)))', zIndex: 150,
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
              fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      )}
    </div>
  );
}
