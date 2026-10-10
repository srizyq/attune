import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import { hasProAccess } from '../lib/proAccess';
import { useAdaptiveTarget } from '../hooks/useAdaptiveTarget';
import { DIET_STYLES, FAT_PCT_RANGE, PROTEIN_PCT_RANGE, dietStyleFor, splitForStyle } from '../lib/dietStyles';
import { goalMacroSplits, calcCalories, buildTargets, splitFromGrams, calcGoalAdjustment, defaultPace, clampToFloor, MIN_CALORIES } from '../lib/calorieTargets';
import { useWeightLogs } from '../hooks/useWeightLogs';
import { toKg } from '../lib/adaptiveTDEE';
import { todayLocalDate } from '../lib/patterns';
import GoalRateCard from '../components/settings/GoalRateCard';
import { MICRO_NUTRIENTS } from '../lib/microNutrients';
import { dayTargetsToInputs, parseDayTargetInputs } from '../lib/dayTargets';
import RestDayTargetsCard from '../components/settings/RestDayTargetsCard';
import CalorieLimitCard from '../components/settings/CalorieLimitCard';
import AppNav from '../components/AppNav';
import Slider from '../components/Slider';
import EditableNumber from '../components/EditableNumber';
import MacroPreviewBar from '../components/MacroPreviewBar';
import { Card, SectionLabel, FieldRow, Select, Segmented, Toggle } from '../components/settings/primitives';
import PageHeader from '../components/PageHeader';

const LB_PER_KG = 2.20462;
// "−0.4 kg/week" / "+0.3 lb/week", or "holding steady" near zero.
function formatRate(kgPerWeek, unit) {
  const v = unit === 'imperial' ? kgPerWeek * LB_PER_KG : kgPerWeek;
  const rounded = Math.round(v * 10) / 10;
  if (rounded === 0) return 'holding steady';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)} ${unit === 'imperial' ? 'lb' : 'kg'}/week`;
}

// Shows the adaptive-target estimate, or an honest explanation of what's
// still needed — mirrors the pattern engine's "log N more days" gating
// rather than silently falling back to a guess.
function AdaptiveTargetPanel({ loading, result, goal, paceKg, unit, onRefresh }) {
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
      'not-enough-weigh-ins': `Log your weight on ${result.daysNeeded} more day${result.daysNeeded === 1 ? '' : 's'} — a few weigh-ins are needed so one off day on the scale can't skew your target.`,
      'implausible-estimate': "Your logged food and weight don't add up to a believable maintenance level — usually a few days of unfinished food logging. Keep logging and it'll settle.",
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
      {goal !== 'maintain' && (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: '0 0 8px' }} data-testid="adaptive-rate">
          Your trend is {formatRate(estimate.weeklyRateKg, unit)}{paceKg ? ` — you're aiming for ${formatRate(goal === 'lose' ? -paceKg : paceKg, unit)}` : ''}.
        </p>
      )}
      {result.clamped && (
        <p style={{ color: 'var(--gold)', fontSize: '12px', margin: '0 0 8px' }}>
          Held at {MIN_CALORIES.toLocaleString()} kcal, the lowest target we'll set — your chosen rate would go lower.
        </p>
      )}
      <button
        onClick={onRefresh}
        style={{ background: 'none', border: '1px solid var(--border-default)', borderRadius: '7px', padding: '5px 12px', color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        Recalculate
      </button>
    </div>
  );
}

// Points at the pricing page rather than starting checkout right here —
// see Pricing.jsx, which is now the one place that actually talks to
// Stripe for Pro/Coach, so there's a single tested checkout path instead
// of one per paywall.
function UpgradeProButton({ pendingConfirmation, onGoToProfile, onGoToPricing }) {
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
    <button
      onClick={onGoToPricing}
      style={{ background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      Upgrade to Pro
    </button>
  );
}

// `sex` isn't editable here but the formula needs it (Mifflin–St Jeor differs by
// ~166 kcal); `pace` is the weekly goal rate in kg, null = not chosen yet.
// How long after the last change the draft is written to the profile. Long
// enough that dragging a slider is one save, short enough to feel immediate.
const AUTOSAVE_DELAY_MS = 600;
const SAVED_FLASH_MS = 1800;

const DEFAULT_FORM = { unit: 'metric', age: 30, weight: 70, height: 170, goal: 'maintain', activity: 'moderate', sex: 'unspecified', pace: null, targetWeight: '' };

export default function SettingsGoals() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';
  // RequireAuth's isUnsignedGuest gate means is_anonymous here can only
  // mean "signed up, hasn't confirmed their email yet" — never "browsing
  // without an account".
  const pendingConfirmation = !!user?.is_anonymous;
  // idle → saving → saved (flashes, then idle) | error. Edits are written
  // to the profile automatically; there is no Save button.
  const [saveState, setSaveState] = useState('idle');
  const [saveError, setSaveError] = useState(null);
  // The draft (as draftKey) last handed to a save — autosave only fires for a
  // draft that differs from it.
  const [lastSavedKey, setLastSavedKey] = useState(null);
  const { latest: latestWeight } = useWeightLogs(todayLocalDate(), todayLocalDate());

  const [form, setForm] = useState(DEFAULT_FORM);
  const [calMode, setCalMode] = useState('calculated');
  const [customCal, setCustomCal] = useState(2000);
  const [proteinPct, setProteinPct] = useState(30);
  const [fatPct, setFatPct] = useState(30);
  // Count carbs as net (minus fibre). Only offered once the database has the
  // column — an un-updated profile row simply has no such field.
  const supportsNetCarbs = !!profile && 'net_carbs' in profile;
  const [netCarbs, setNetCarbs] = useState(false);
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
    form.pace !== baseline.pace || form.targetWeight !== baseline.targetWeight ||
    calMode !== baseline.calMode || customCal !== baseline.customCal ||
    proteinPct !== baseline.proteinPct || fatPct !== baseline.fatPct || netCarbs !== baseline.netCarbs ||
    JSON.stringify(microTargets) !== JSON.stringify(baseline.microTargets) ||
    JSON.stringify(restDay) !== JSON.stringify(baseline.restDay)
  );
  const { compute: computeAdaptive } = useAdaptiveTarget();
  const [adaptiveResult, setAdaptiveResult] = useState(null);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);

  // Only the latest request may write its result — switching goals quickly
  // can otherwise let an older, slower response land last.
  const adaptiveRequestRef = useRef(0);
  const refreshAdaptive = async (goal, pace) => {
    const requestId = ++adaptiveRequestRef.current;
    setAdaptiveLoading(true);
    try {
      const result = await computeAdaptive(goal, pace);
      if (requestId === adaptiveRequestRef.current) setAdaptiveResult(result);
    } finally {
      if (requestId === adaptiveRequestRef.current) setAdaptiveLoading(false);
    }
  };

  // Sync form state once the real profile loads — also snapshots the
  // same values into `baseline`, since this runs again right after a
  // save resolves (saveProfile updates the profile this hook reads), at
  // which point draft and baseline naturally converge and the popup
  // disappears without handleSave needing to touch baseline itself.
  useEffect(() => {
    if (!profile) return;
    // The profile changes after every autosave. If the person has kept editing
    // since that save began, their draft is newer than what just came back —
    // overwriting it would snap a slider back mid-drag — so only refresh the
    // baseline and leave the draft alone.
    const keepDraft = isDirty;
    const syncedForm = {
      unit: profile.unit || 'metric',
      age: profile.age || 30,
      weight: profile.weight || 70,
      height: profile.height || 170,
      goal: profile.goal || 'maintain',
      activity: profile.activity || 'moderate',
      sex: profile.sex || 'unspecified',
      pace: profile.pace_kg_per_week != null ? Number(profile.pace_kg_per_week) : null,
      targetWeight: profile.target_weight != null ? String(profile.target_weight) : '',
    };
    if (!keepDraft) setForm(syncedForm);
    let syncedCal = customCal, syncedProtein = proteinPct, syncedFat = fatPct;
    if (profile.calorie_target) {
      syncedCal = profile.calorie_target;
      const split = splitFromGrams(profile.protein_g || 0, profile.carbs_g || 0, profile.fat_g || 0);
      syncedProtein = Math.round(split.protein * 100);
      syncedFat = Math.round(split.fat * 100);
      if (!keepDraft) {
        setCustomCal(syncedCal);
        setProteinPct(syncedProtein);
        setFatPct(syncedFat);
      }
    }
    let syncedMode = calMode;
    if (profile.calorie_mode) {
      syncedMode = profile.calorie_mode;
      if (!keepDraft) setCalMode(syncedMode);
      if (!keepDraft && syncedMode === 'adaptive') refreshAdaptive(profile.goal || 'maintain', syncedForm.goal === 'maintain' ? null : (syncedForm.pace ?? defaultPace(syncedForm.goal)));
    }
    const syncedMicroTargets = Object.fromEntries(
      Object.entries(profile.micro_targets || {}).map(([k, v]) => [k, String(v)])
    );
    const syncedNetCarbs = !!profile.net_carbs;
    if (!keepDraft) setNetCarbs(syncedNetCarbs);
    if (!keepDraft) setMicroTargets(syncedMicroTargets);
    const syncedRestDay = { inputs: dayTargetsToInputs(profile).inputs, trainingDays: dayTargetsToInputs(profile).trainingDays };
    if (!keepDraft) {
      setRestDay(syncedRestDay);
      setDayError(null);
    }
    setBaseline({
      ...syncedForm, age: Number(syncedForm.age), weight: Number(syncedForm.weight), height: Number(syncedForm.height),
      calMode: syncedMode, customCal: syncedCal, proteinPct: syncedProtein, fatPct: syncedFat, netCarbs: syncedNetCarbs,
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
  // The weekly rate that applies right now: the chosen one, else the default
  // for the goal. Maintain has none.
  const paceFor = (goal) => (goal === 'maintain' ? null : (form.pace ?? defaultPace(goal)));
  const effectivePace = paceFor(form.goal);
  const calculatedCal = calcCalories({ ...form, paceKgPerWeek: effectivePace });
  // The adaptive estimate (maintenance) is fetched once; the goal's offset is
  // applied here, so dragging the rate slider or switching goal moves the
  // target live instead of re-querying a couple of months of logs per tick.
  const adaptiveView = adaptiveResult?.ready
    ? { ...adaptiveResult, ...(() => { const c = clampToFloor(Math.round(adaptiveResult.estimate.tdee + calcGoalAdjustment(form.goal, effectivePace))); return { target: c.calories, clamped: c.clamped }; })() }
    : adaptiveResult;
  const currentKg = latestWeight ? toKg(latestWeight.weight, latestWeight.unit) : toKg(form.weight, form.unit === 'imperial' ? 'lb' : 'kg');
  const calories = calMode === 'calculated' ? calculatedCal
    : calMode === 'adaptive' ? (adaptiveView?.ready ? adaptiveView.target : calculatedCal)
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
    if (calMode === 'adaptive') refreshAdaptive(goal, paceFor(goal));
  };

  // Diet style presets just move the two sliders (carbs fill the rest); keto also
  // turns net carbs on, since that's how keto is counted. The chip shown is
  // derived from the sliders, so dragging one off a preset reads as "Custom".
  const goalSplit = goalMacroSplits[form.goal];
  const dietStyle = dietStyleFor(proteinPct, fatPct, goalSplit);
  const applyDietStyle = (id) => {
    const target = splitForStyle(id, goalSplit);
    if (!target) return;
    setProteinPct(target.protein);
    setFatPct(target.fat);
    if (DIET_STYLES.find((d) => d.id === id)?.netCarbs && supportsNetCarbs) setNetCarbs(true);
  };

  // Everything the draft would write, as one string: what autosave compares to
  // decide "has anything changed since the last save".
  const draftKey = JSON.stringify({ form, calMode, customCal, proteinPct, fatPct, netCarbs, microTargets, restDay, calories: preview.calories });
  // Adaptive's number isn't known until its estimate arrives; saving the
  // placeholder first would write the wrong target for a moment.
  const adaptivePending = calMode === 'adaptive' && (adaptiveLoading || !adaptiveResult);

  const handleSave = async () => {
    setLastSavedKey(draftKey);
    // Rest-day targets: an invalid entry is reported but doesn't hold up the
    // rest of the page — everything else still saves, and the rest-day fields
    // are left as they were until they're valid. Adaptive mode can't have them
    // (it rewrites the everyday numbers itself), so saving there turns them off.
    let dayFields = {};
    if (supportsDay) {
      if (calMode === 'adaptive') {
        dayFields = { rest_day_targets: null, training_days: null };
      } else {
        const parsed = parseDayTargetInputs(restDay.inputs, restDay.trainingDays);
        if (parsed.error) setDayError(parsed.error);
        else {
          setDayError(null);
          dayFields = { rest_day_targets: parsed.rest, training_days: parsed.trainingDays };
        }
      }
    } else {
      setDayError(null);
    }
    setSaveState('saving');
    setSaveError(null);
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
        // Maintain has no rate, so it leaves whatever was chosen for lose/build alone.
        pace_kg_per_week: form.goal === 'maintain' ? form.pace : effectivePace,
        ...(form.goal !== 'maintain' ? { target_weight: Number(form.targetWeight) > 0 ? Number(form.targetWeight) : null } : {}),
        calorie_mode: calMode,
        calorie_target: preview.calories,
        protein_g: preview.protein.g,
        carbs_g: preview.carbs.g,
        fat_g: preview.fat.g,
        water_target: preview.water,
        micro_targets: cleanedMicroTargets,
        ...(supportsNetCarbs ? { net_carbs: netCarbs } : {}),
        ...dayFields,
      });
      // saveProfile updates `profile`, which re-runs the sync effect above and
      // refreshes `baseline` to match, so isDirty clears on its own.
      setSaveState('saved');
    } catch (err) {
      // This used to vanish — the page just looked like it hadn't saved.
      console.error('Saving goals failed:', err);
      setSaveError(err?.message || 'Unknown error');
      setSaveState('error');
    }
  };

  const needsSave = isDirty && draftKey !== lastSavedKey && !adaptivePending;

  // Autosave: a short pause after the last change, one save at a time. A change
  // made while a save is in flight is picked up when it finishes (saveState
  // leaves 'saving', this re-runs). A save that failed isn't retried until the
  // draft changes again, so a persistent error can't loop.
  const handleSaveRef = useRef(handleSave);
  const needsSaveRef = useRef(false);
  useEffect(() => {
    handleSaveRef.current = handleSave;
    needsSaveRef.current = needsSave;
  });
  useEffect(() => {
    if (!needsSave || saveState === 'saving') return;
    const t = setTimeout(() => handleSaveRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [draftKey, needsSave, saveState]);

  // Leaving the page inside the pause shouldn't lose the last change.
  useEffect(() => () => { if (needsSaveRef.current) handleSaveRef.current(); }, []);

  useEffect(() => {
    if (saveState !== 'saved') return;
    const t = setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), SAVED_FLASH_MS);
    return () => clearTimeout(t);
  }, [saveState]);

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
                { value: 'lose',     icon: 'ti-trending-down', label: 'Lose weight',  desc: `−${Math.abs(calcGoalAdjustment('lose', paceFor('lose'))).toLocaleString()} kcal/day` },
                { value: 'maintain', icon: 'ti-scale',         label: 'Maintain',     desc: 'At maintenance' },
                { value: 'build',    icon: 'ti-barbell',       label: 'Build muscle', desc: `+${Math.abs(calcGoalAdjustment('build', paceFor('build'))).toLocaleString()} kcal/day` },
              ]}
            />
            {form.goal !== 'maintain' && (
              <GoalRateCard
                goal={form.goal}
                unit={form.unit}
                paceKg={effectivePace}
                onPaceChange={(kg) => set('pace', kg)}
                targetWeight={form.targetWeight}
                onTargetWeightChange={(v) => set('targetWeight', v)}
                currentKg={currentKg}
                manualCalories={calMode === 'custom'}
              />
            )}
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
                      if (m.value === 'adaptive' && !adaptiveResult) refreshAdaptive(form.goal, effectivePace);
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
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '40px', fontWeight: 700, color: 'var(--accent)', width: '5.5ch' }}
                />
              ) : (
                <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '40px', fontWeight: 700, color: 'var(--accent)' }}>
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
              <AdaptiveTargetPanel loading={adaptiveLoading} result={adaptiveView} goal={form.goal} paceKg={effectivePace} unit={form.unit} onRefresh={() => refreshAdaptive(form.goal, effectivePace)} />
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', margin: 0 }}>
                Calculated from your stats, goal and activity level. Switch to Custom to set it manually.
              </p>
            )}
          </Card>

          <Card style={{ marginBottom: 0 }}>
            <SectionLabel>Macro split</SectionLabel>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Diet style</div>
              <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Diet style">
                {DIET_STYLES.map((d) => {
                  const active = dietStyle === d.id;
                  return (
                    <button
                      key={d.id} type="button" className="btn-press" aria-pressed={active} onClick={() => applyDietStyle(d.id)}
                      style={{
                        flex: 1, minWidth: 0, padding: '9px 6px', borderRadius: 10, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif",
                        background: active ? 'var(--accent-bg)' : 'transparent',
                        border: `1px solid ${active ? 'var(--border-active)' : 'var(--border-default)'}`,
                        color: active ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{d.label}</span>
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-hint)', marginTop: 2 }}>{d.desc}</span>
                    </button>
                  );
                })}
              </div>
              {dietStyle === 'custom' && <p style={{ color: 'var(--text-hint)', fontSize: 11, margin: '8px 0 0' }}>Custom split — set with the sliders below.</p>}
              {dietStyle === 'keto' && (
                <p style={{ color: 'var(--text-hint)', fontSize: 11, margin: '8px 0 0', lineHeight: 1.5 }}>
                  Very low carb, high fat. It isn't right for everyone — check with a doctor first if you have a medical condition, are pregnant, or take medication.
                </p>
              )}
            </div>

            {supportsNetCarbs && (
              <div style={{ marginBottom: '20px' }}>
                <FieldRow label="Count net carbs" hint="Carbs minus fibre — your carb target and totals use net carbs">
                  <Toggle on={netCarbs} onChange={setNetCarbs} />
                </FieldRow>
              </div>
            )}

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Protein</span>
                <EditableNumber
                  value={proteinPct}
                  min={PROTEIN_PCT_RANGE.min}
                  max={PROTEIN_PCT_RANGE.max}
                  suffix="%"
                  onChange={v => setProteinPct(Math.min(v, 100 - fatPct))}
                  ariaLabel="Protein percent of calories"
                  style={{ color: 'var(--accent)', fontSize: '13px', fontWeight: 600, width: '3.5ch' }}
                />
              </div>
              <Slider value={proteinPct} min={PROTEIN_PCT_RANGE.min} max={PROTEIN_PCT_RANGE.max} onChange={v => setProteinPct(Math.min(v, 100 - fatPct))} color="var(--macro-protein)" />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>Fat</span>
                <EditableNumber
                  value={fatPct}
                  min={FAT_PCT_RANGE.min}
                  max={FAT_PCT_RANGE.max}
                  suffix="%"
                  onChange={v => setFatPct(Math.min(v, 100 - proteinPct))}
                  ariaLabel="Fat percent of calories"
                  style={{ color: 'var(--ai-purple)', fontSize: '13px', fontWeight: 600, width: '3.5ch' }}
                />
              </div>
              <Slider value={fatPct} min={FAT_PCT_RANGE.min} max={FAT_PCT_RANGE.max} onChange={v => setFatPct(Math.min(v, 100 - proteinPct))} color="var(--ai-purple)" />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600 }}>{netCarbs ? 'Net carbs' : 'Carbs'}</span>
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
              <MacroPreviewBar label="Protein" grams={preview.protein.g} calories={preview.protein.cal} pct={preview.protein.pct} color="var(--macro-protein)" />
              <MacroPreviewBar label={netCarbs ? 'Net carbs' : 'Carbs'} grams={preview.carbs.g}   calories={preview.carbs.cal}   pct={preview.carbs.pct}   color="var(--water-blue)" />
              <MacroPreviewBar label="Fat"     grams={preview.fat.g}     calories={preview.fat.cal}     pct={preview.fat.pct}     color="var(--ai-purple)" />
            </div>
          </Card>

          </div>

          <CalorieLimitCard
            profile={profile}
            today={todayLocalDate()}
            onSave={(periods) => saveProfile({ calorie_limit_periods: periods })}
            onUpgrade={() => navigate('/pricing')}
            pendingConfirmation={pendingConfirmation}
            onConfirmEmail={() => navigate('/settings/personal')}
          />

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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
              <SectionLabel>Micronutrient targets</SectionLabel>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
            </div>
            {!hasProAccess(profile) ? (
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
                  <UpgradeProButton pendingConfirmation={pendingConfirmation} onGoToProfile={() => navigate('/settings/personal')} onGoToPricing={() => navigate('/pricing')} />
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
                        {/* Fixed-width unit column so g / mg / mcg don't make some inputs narrower than others. */}
                        <span style={{ fontSize: 12, color: 'var(--text-hint)', flexShrink: 0, width: 28, textAlign: 'right' }}>{n.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </div>

      {saveState !== 'idle' && (
        <div
          role="status"
          className="toast-in"
          style={{
            // Sits above the keyboard's top edge as well as the bottom nav:
            // plain `bottom` is measured from the layout viewport, which an
            // open keyboard covers; adding back the keyboard's height keeps it
            // visible, and adds 0 when no keyboard is open.
            position: 'fixed', left: '50%', bottom: 'calc(84px + (100vh - var(--vvh, 100vh)))', zIndex: 150,
            width: 'calc(100% - 32px)', maxWidth: 420,
            background: 'var(--bg-subtle)', border: `1px solid ${saveState === 'error' ? 'var(--danger)' : 'var(--border-strong)'}`, borderRadius: 14,
            padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
            boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          }}
        >
          <span style={{ color: saveState === 'error' ? 'var(--danger)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, minWidth: 0 }}>
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved' && 'Saved'}
            {saveState === 'error' && (
              <>Couldn't save your changes<span style={{ display: 'block', fontWeight: 400, fontSize: 12, color: 'var(--text-muted)', marginTop: 2, wordBreak: 'break-word' }}>{saveError}</span></>
            )}
          </span>
          {saveState === 'error' && (
            <button
              onClick={handleSave}
              style={{ padding: '8px 16px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--accent-contrast)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", flexShrink: 0 }}
            >
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}
