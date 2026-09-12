// src/pages/onboarding/Step3.jsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OnboardingLayout from '../../components/OnboardingLayout';
import Slider from '../../components/Slider';
import { activityMultipliers, calcBMR, calcGoalAdjustment, goalMacroSplits } from '../../lib/calorieTargets';

function ageFromDOB(dob) {
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function AnimatedNumber({ target, duration = 1000 }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);

  return <>{display.toLocaleString()}</>;
}

function MacroBar({ label, grams, calories, pct, color, delay = 0 }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setWidth(pct * 100), 300 + delay);
    return () => clearTimeout(t);
  }, [pct, delay]);

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>{label}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{grams}g</span>
          {' '}· {calories} kcal
        </span>
      </div>
      <div style={{ height: '6px', background: 'var(--border-default)', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${width}%`,
          background: color,
          borderRadius: '99px',
          transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
        }} />
      </div>
    </div>
  );
}

export default function Step3() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [targets, setTargets] = useState(null);
  const [editingMacros, setEditingMacros] = useState(false);

  // Recomputes grams/calories for all three macros from a protein/fat
  // split — carbs always fill whatever's left, same convention as
  // Settings' own macro-split editor (which this reuses the Slider from).
  // Calorie target itself isn't touched here, only how it's divided up.
  function applyMacroSplit(proteinPct, fatPct) {
    setTargets(t => {
      const carbsPct = Math.max(0, 1 - proteinPct - fatPct);
      const proteinCal = t.calories * proteinPct;
      const carbsCal = t.calories * carbsPct;
      const fatCal = t.calories * fatPct;
      return {
        ...t,
        protein: { g: Math.round(proteinCal / 4), cal: Math.round(proteinCal), pct: proteinPct },
        carbs: { g: Math.round(carbsCal / 4), cal: Math.round(carbsCal), pct: carbsPct },
        fat: { g: Math.round(fatCal / 9), cal: Math.round(fatCal), pct: fatPct },
      };
    });
  }

  useEffect(() => {
    const saved = JSON.parse(sessionStorage.getItem('attune_onboarding') || '{}');
    const age = saved.dateOfBirth ? ageFromDOB(saved.dateOfBirth) : saved.age;
    setData({ ...saved, age });

    if (age && saved.weight && saved.height && saved.activity && saved.goal) {
      const bmr = calcBMR(saved.weight, saved.height, age, saved.unit || 'metric', saved.sex);
      const tdee = bmr * (activityMultipliers[saved.activity] || 1.55);
      const calorieTarget = Math.round(tdee + calcGoalAdjustment(saved.goal, saved.paceKgPerWeek));

      const splits = goalMacroSplits[saved.goal] || goalMacroSplits.maintain;
      const proteinCal = calorieTarget * splits.protein;
      const carbsCal   = calorieTarget * splits.carbs;
      const fatCal     = calorieTarget * splits.fat;

      setTargets({
        calories: calorieTarget,
        protein: { g: Math.round(proteinCal / 4), cal: Math.round(proteinCal), pct: splits.protein },
        carbs:   { g: Math.round(carbsCal   / 4), cal: Math.round(carbsCal),   pct: splits.carbs   },
        fat:     { g: Math.round(fatCal      / 9), cal: Math.round(fatCal),     pct: splits.fat     },
        water: 8, // glasses default
      });
    }
  }, []);

  const handleNext = () => {
    const existing = JSON.parse(sessionStorage.getItem('attune_onboarding') || '{}');
    const age = existing.dateOfBirth ? ageFromDOB(existing.dateOfBirth) : existing.age;
    sessionStorage.setItem('attune_onboarding', JSON.stringify({ ...existing, age, targets }));
    navigate('/onboarding/step4');
  };

  if (!targets) {
    return (
      <OnboardingLayout step={3}>
        <p style={{ color: 'var(--text-muted)' }}>Calculating your targets…</p>
      </OnboardingLayout>
    );
  }

  const goalLabels = { lose: 'weight loss', maintain: 'maintenance', build: 'muscle building' };

  return (
    <OnboardingLayout step={3}>
      <div style={{ width: '100%', maxWidth: '520px' }}>

        {/* Heading */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
            your targets
          </p>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 'clamp(26px, 4vw, 36px)',
            fontWeight: 700,
            color: 'var(--text-primary)',
            lineHeight: 1.2,
            marginBottom: '8px',
          }}>
            Here's your daily plan
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            Optimised for {goalLabels[data?.goal] || 'your goal'}. You can adjust these any time.
          </p>
        </div>

        {/* Calorie card */}
        <div style={{
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)',
          borderRadius: '16px',
          padding: '28px',
          textAlign: 'center',
          marginBottom: '16px',
        }}>
          <p style={{ color: 'var(--accent-dark)', fontSize: '12px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '8px' }}>
            daily calorie target
          </p>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: 'clamp(44px, 8vw, 64px)',
            fontWeight: 700,
            color: 'var(--accent)',
            lineHeight: 1,
            marginBottom: '4px',
          }}>
            <AnimatedNumber target={targets.calories} />
          </div>
          <p style={{ color: 'var(--accent-dark)', fontSize: '14px' }}>kcal per day</p>
        </div>

        {/* Sets expectations up front, MacroFactor-style — this number is
            a starting point from a formula, not a promise; it improves
            once there's real logged data to learn from. */}
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, textAlign: 'center', marginBottom: '20px' }}>
          A starting point, not a promise — Attune fine-tunes this from your real logs over the next couple of weeks.
        </p>

        {/* Macro breakdown card */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
              macro breakdown
            </p>
            <button
              onClick={() => setEditingMacros(e => !e)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <i className={`ti ${editingMacros ? 'ti-check' : 'ti-pencil'}`} style={{ fontSize: 13 }} />
              {editingMacros ? 'Done' : 'Edit'}
            </button>
          </div>
          <MacroBar label="Protein"       grams={targets.protein.g} calories={targets.protein.cal} pct={targets.protein.pct} color="var(--accent)" delay={0}   />
          {editingMacros && (
            <div style={{ marginTop: '-10px', marginBottom: '16px' }}>
              <Slider value={Math.round(targets.protein.pct * 100)} min={10} max={60} onChange={v => applyMacroSplit(v / 100, targets.fat.pct)} color="var(--accent)" />
            </div>
          )}
          <MacroBar label="Carbohydrates" grams={targets.carbs.g}   calories={targets.carbs.cal}   pct={targets.carbs.pct}   color="var(--water-blue)" delay={100} />
          {editingMacros && (
            <p style={{ color: 'var(--text-hint)', fontSize: '11px', margin: '-10px 0 16px' }}>Carbs fill whatever's left, so the split always totals 100%.</p>
          )}
          <MacroBar label="Fat"           grams={targets.fat.g}     calories={targets.fat.cal}      pct={targets.fat.pct}     color="var(--ai-purple)" delay={200} />
          {editingMacros && (
            <div style={{ marginTop: '-10px' }}>
              <Slider value={Math.round(targets.fat.pct * 100)} min={10} max={50} onChange={v => applyMacroSplit(targets.protein.pct, v / 100)} color="var(--ai-purple)" />
            </div>
          )}
        </div>

        {/* Water target */}
        <div style={{
          background: 'var(--bg-subtle)',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '20px' }}>💧</span>
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>Water target</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Based on your body weight</div>
            </div>
          </div>
          <div style={{ color: 'var(--water-blue)', fontSize: '20px', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
            8 <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>glasses</span>
          </div>
        </div>

        {/* Back + Next */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => navigate('/onboarding/step2')}
            style={{
              flex: '0 0 auto',
              padding: '16px 20px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '10px',
              color: 'var(--text-muted)',
              fontSize: '15px',
              cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            ←
          </button>
          <button
            onClick={handleNext}
            style={{
              flex: 1,
              padding: '16px',
              background: 'var(--accent)',
              border: '1px solid var(--accent)',
              borderRadius: '10px',
              color: '#0f0f0f',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            Let's go →
          </button>
        </div>
      </div>
    </OnboardingLayout>
  );
}
