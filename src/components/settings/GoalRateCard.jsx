import Slider from '../Slider';
import { calcGoalAdjustment, paceWarning, projectFinish, PACE_MIN_KG, PACE_MAX_KG } from '../../lib/calorieTargets';
import { toKg } from '../../lib/adaptiveTDEE';

const LB_PER_KG = 2.20462;

// Slider runs in the units the person thinks in — kg in 0.05 steps, or lb in
// quarter-pound steps — while the stored rate is always kg/week, the one
// unit calorieTargets.js works in.
const SCALE = {
  metric:   { unit: 'kg', min: PACE_MIN_KG,             max: PACE_MAX_KG,             step: 0.05, fromKg: (kg) => kg,           toKg: (v) => v },
  imperial: { unit: 'lb', min: 0.25,                    max: 2,                       step: 0.25, fromKg: (kg) => kg * LB_PER_KG, toKg: (v) => Math.round((v / LB_PER_KG) * 1000) / 1000 },
};

const snap = (v, { min, max, step }) => Math.min(max, Math.max(min, Math.round(v / step) * step));
const fmt = (n) => String(Math.round(n * 100) / 100);

function dateLabel(d) {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// "How fast?" — MacroFactor-style: you choose a weekly rate and a target
// weight; the daily calorie offset and the finish date follow from them.
export default function GoalRateCard({ goal, unit, paceKg, onPaceChange, targetWeight, onTargetWeightChange, currentKg, now }) {
  const scale = SCALE[unit === 'imperial' ? 'imperial' : 'metric'];
  const shown = snap(scale.fromKg(paceKg), scale);
  const offset = Math.abs(calcGoalAdjustment(goal, paceKg));
  const warning = paceWarning(goal, paceKg, currentKg);

  const targetKg = Number(targetWeight) > 0 ? toKg(Number(targetWeight), unit === 'imperial' ? 'lb' : 'kg') : null;
  const finish = targetKg ? projectFinish(goal, currentKg, targetKg, paceKg, now) : null;

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>
          {goal === 'lose' ? 'Weekly loss rate' : 'Weekly gain rate'}
        </span>
        <span style={{ color: 'var(--accent)', fontSize: 14, fontWeight: 600 }} data-testid="goal-rate-value">
          {fmt(shown)} {scale.unit}/week
        </span>
      </div>
      <Slider
        value={shown} min={scale.min} max={scale.max} step={scale.step}
        onChange={(v) => onPaceChange(scale.toKg(v))}
        aria-label="Weekly rate"
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-hint)', fontSize: 11, marginTop: 6 }}>
        <span>Slower</span><span>Faster</span>
      </div>
      <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }}>
        {goal === 'lose' ? '−' : '+'}{offset.toLocaleString()} kcal/day from your maintenance
      </p>
      {warning && (
        <p role="note" style={{ color: 'var(--gold)', fontSize: 12, margin: '8px 0 0', lineHeight: 1.5 }}>{warning}</p>
      )}

      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <label htmlFor="goal-target-weight" style={{ color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500 }}>Target weight</label>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              id="goal-target-weight"
              type="number" inputMode="decimal" min="0"
              value={targetWeight}
              onChange={(e) => onTargetWeightChange(e.target.value)}
              style={{ width: 84, padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, textAlign: 'right', fontFamily: 'inherit', outline: 'none' }}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{scale.unit}</span>
          </span>
        </div>
        {finish?.status === 'on-track' && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }} data-testid="goal-finish">
            At this rate you'd reach it in about {Math.max(1, Math.round(finish.weeks))} week{Math.round(finish.weeks) === 1 ? '' : 's'} — around {dateLabel(finish.date)}.
          </p>
        )}
        {finish?.status === 'reached' && (
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '8px 0 0' }} data-testid="goal-finish">You're at your target weight.</p>
        )}
        {finish?.status === 'wrong-direction' && (
          <p role="note" style={{ color: 'var(--gold)', fontSize: 12, margin: '8px 0 0' }} data-testid="goal-finish">
            That target is {goal === 'lose' ? 'above' : 'below'} your current weight, so it doesn't fit a {goal === 'lose' ? 'weight-loss' : 'muscle-building'} goal.
          </p>
        )}
      </div>
    </div>
  );
}
