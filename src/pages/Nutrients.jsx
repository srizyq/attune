import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { todayLocalDate } from '../lib/patterns';
import AppNav from '../components/AppNav';

function MacroRow({ label, value, unit, target, color }) {
  const pct = target ? Math.min((value / target) * 100, 100) : null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
          {value}{unit}{target ? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> / {target}{unit}</span> : null}
        </span>
      </div>
      {pct !== null && (
        <div style={{ height: 6, background: 'var(--border-default)', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
        </div>
      )}
    </div>
  );
}

// `locked` blurs the value/guideline and overlays a lock badge instead of
// hiding the card entirely — free users see exactly what's on offer
// (label, icon, guideline) without the actual number, then tap through
// to Settings to upgrade rather than wondering why a nutrient vanished.
function MicroCard({ icon, label, value, unit, guideline, target, color, locked, onUpgrade }) {
  const pct = target ? Math.min((value / target) * 100, 100) : null;
  return (
    <div
      onClick={locked ? onUpgrade : undefined}
      style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 18, position: 'relative', cursor: locked ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, background: color + '22', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', filter: locked ? 'blur(6px)' : 'none', userSelect: locked ? 'none' : 'auto' }}>
        {value}
        {target ? <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}> / {target}{unit}</span> : <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>}
      </div>
      {/* A custom target (Settings → Goals & Targets, Pro-only) replaces
          the static guideline with real progress — no target set keeps
          today's default guideline text unchanged. */}
      {target ? (
        <div style={{ height: 5, background: 'var(--border-default)', borderRadius: 99, marginTop: 8, filter: locked ? 'blur(4px)' : 'none' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
        </div>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, filter: locked ? 'blur(4px)' : 'none' }}>{guideline}</div>
      )}
      {locked && (
        <div style={{ position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--border-active)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', fontSize: 11 }}>
          <i className="ti ti-lock" />
        </div>
      )}
    </div>
  );
}

export default function Nutrients() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useProfile();
  const today = todayLocalDate();

  // Dashboard's chart card / macro grid link here with the day currently
  // being viewed (which may be a past day), so this always matches
  // whichever day's Dashboard you tapped through from, not always today.
  const [selectedDate, setSelectedDate] = useState(() => {
    const requested = location.state?.date;
    return requested && requested <= today ? requested : today;
  });
  useEffect(() => {
    const requested = location.state?.date;
    if (requested && requested <= today) setSelectedDate(requested);
  }, [location.state, today]);

  const isToday = selectedDate === today;
  function shiftDate(days) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + days);
    const next = todayLocalDate(d);
    if (next > today) return;
    setSelectedDate(next);
  }

  const { logs, loading } = useFoodLogs(selectedDate);

  const initials = (profile?.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const totals = logs.reduce((t, row) => ({
    cal: t.cal + (Number(row.calories) || 0),
    protein: t.protein + (Number(row.protein_g) || 0),
    carbs: t.carbs + (Number(row.carbs_g) || 0),
    fat: t.fat + (Number(row.fat_g) || 0),
    fibre: t.fibre + (Number(row.fibre_g) || 0),
    sodium: t.sodium + (Number(row.sodium_mg) || 0),
    sugar: t.sugar + (Number(row.sugar_g) || 0),
    saturatedFat: t.saturatedFat + (Number(row.saturated_fat_g) || 0),
    transFat: t.transFat + (Number(row.trans_fat_g) || 0),
    cholesterol: t.cholesterol + (Number(row.cholesterol_mg) || 0),
    potassium: t.potassium + (Number(row.potassium_mg) || 0),
    addedSugar: t.addedSugar + (Number(row.added_sugar_g) || 0),
    vitaminD: t.vitaminD + (Number(row.vitamin_d_mcg) || 0),
    calcium: t.calcium + (Number(row.calcium_mg) || 0),
    iron: t.iron + (Number(row.iron_mg) || 0),
    vitaminA: t.vitaminA + (Number(row.vitamin_a_mcg) || 0),
    vitaminC: t.vitaminC + (Number(row.vitamin_c_mg) || 0),
    vitaminB12: t.vitaminB12 + (Number(row.vitamin_b12_mcg) || 0),
    folate: t.folate + (Number(row.folate_mcg) || 0),
    magnesium: t.magnesium + (Number(row.magnesium_mg) || 0),
    zinc: t.zinc + (Number(row.zinc_mg) || 0),
    polyunsaturatedFat: t.polyunsaturatedFat + (Number(row.polyunsaturated_fat_g) || 0),
    monounsaturatedFat: t.monounsaturatedFat + (Number(row.monounsaturated_fat_g) || 0),
  }), {
    cal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0, sugar: 0,
    saturatedFat: 0, transFat: 0, cholesterol: 0, potassium: 0,
    addedSugar: 0, vitaminD: 0, calcium: 0, iron: 0,
    vitaminA: 0, vitaminC: 0, vitaminB12: 0, folate: 0,
    magnesium: 0, zinc: 0, polyunsaturatedFat: 0, monounsaturatedFat: 0,
  });

  const isPremium = !!profile?.is_premium;
  const goUpgrade = () => navigate('/settings');
  // Pro-only custom targets (Settings → Goals & Targets) — a nutrient
  // missing here just means "use the default guideline", handled inside
  // MicroCard itself.
  const microTargets = profile?.micro_targets || {};

  const round1 = n => Math.round(n * 10) / 10;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'DM Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <div className="page-pad-top" style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-default)', position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10 }}>
          <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, display: 'flex' }}>
            <i className="ti ti-arrow-left" />
          </button>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16 }}>Nutrients</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, background: isToday ? 'transparent' : '#1a1508', border: isToday ? 'none' : '1px solid #4a3a1a', borderRadius: 7, padding: isToday ? 0 : '3px 4px' }}>
            <button onClick={() => shiftDate(-1)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 15, display: 'flex', padding: 3 }} aria-label="Previous day">
              <i className="ti ti-chevron-left" />
            </button>
            <span style={{ fontSize: 12, color: isToday ? 'var(--text-muted)' : 'var(--gold)', minWidth: 74, textAlign: 'center' }}>
              {isToday ? 'Today' : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <button onClick={() => shiftDate(1)} disabled={isToday} style={{ background: 'none', border: 'none', color: isToday ? 'var(--border-default)' : 'var(--text-muted)', cursor: isToday ? 'default' : 'pointer', fontSize: 15, display: 'flex', padding: 3 }} aria-label="Next day">
              <i className="ti ti-chevron-right" />
            </button>
          </div>
        </div>

        <div className="page-pad" style={{ maxWidth: 700 }}>
          {loading ? null : (
            <>
              <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 16, padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{isToday ? "Today's calories" : 'Calories'}</div>
                <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 700, color: 'var(--accent)', marginBottom: 20 }}>
                  {Math.round(totals.cal).toLocaleString()}
                  {profile?.calorie_target ? <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 400 }}> / {profile.calorie_target.toLocaleString()} kcal</span> : ' kcal'}
                </div>
                <MacroRow label="Protein" value={round1(totals.protein)} unit="g" target={profile?.protein_g} color="var(--accent)" />
                <MacroRow label="Carbs" value={round1(totals.carbs)} unit="g" target={profile?.carbs_g} color="var(--water-blue)" />
                <MacroRow label="Fat" value={round1(totals.fat)} unit="g" target={profile?.fat_g} color="var(--ai-purple)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Other nutrients</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard icon="ti-leaf" label="Fibre" value={round1(totals.fibre)} unit="g" guideline="Guideline: 25–30g/day" target={microTargets.fibre} color="var(--accent)" />
                <MicroCard icon="ti-droplet" label="Sodium" value={Math.round(totals.sodium)} unit="mg" guideline="Guideline: under 2,300mg/day" target={microTargets.sodium} color="var(--water-blue)" />
                <MicroCard icon="ti-candy" label="Sugar" value={round1(totals.sugar)} unit="g" guideline="Guideline: under 50g/day" target={microTargets.sugar} color="var(--gold)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Fat breakdown</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard icon="ti-droplet-filled" label="Saturated fat" value={round1(totals.saturatedFat)} unit="g" guideline="Guideline: under 20g/day" target={microTargets.saturatedFat} color="var(--gold)" />
                <MicroCard icon="ti-alert-triangle" label="Trans fat" value={round1(totals.transFat)} unit="g" guideline="Guideline: as low as possible" target={microTargets.transFat} color="var(--ai-purple)" />
                <MicroCard icon="ti-egg" label="Cholesterol" value={Math.round(totals.cholesterol)} unit="mg" guideline="Guideline: under 300mg/day" target={microTargets.cholesterol} color="var(--water-blue)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Vitamins &amp; minerals</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard icon="ti-candy" label="Added sugar" value={round1(totals.addedSugar)} unit="g" guideline="Guideline: under 25g/day" target={microTargets.addedSugar} color="var(--gold)" />
                <MicroCard icon="ti-bolt" label="Potassium" value={Math.round(totals.potassium)} unit="mg" guideline="Guideline: 2,600–3,400mg/day" target={microTargets.potassium} color="var(--accent)" />
                <MicroCard icon="ti-sun" label="Vitamin D" value={round1(totals.vitaminD)} unit="mcg" guideline="Guideline: 15mcg/day" target={microTargets.vitaminD} color="var(--gold)" />
                <MicroCard icon="ti-bone" label="Calcium" value={Math.round(totals.calcium)} unit="mg" guideline="Guideline: 1,000mg/day" target={microTargets.calcium} color="var(--water-blue)" />
                <MicroCard icon="ti-droplet" label="Iron" value={round1(totals.iron)} unit="mg" guideline="Guideline: 8–18mg/day" target={microTargets.iron} color="var(--ai-purple)" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>More micronutrients</span>
                {!isPremium && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
                )}
              </div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-apple" label="Vitamin A" value={Math.round(totals.vitaminA)} unit="mcg" guideline="Guideline: 700–900mcg/day" target={microTargets.vitaminA} color="var(--gold)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-lemon2" label="Vitamin C" value={round1(totals.vitaminC)} unit="mg" guideline="Guideline: 45mg/day" target={microTargets.vitaminC} color="var(--accent)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-pill" label="Vitamin B12" value={round1(totals.vitaminB12)} unit="mcg" guideline="Guideline: 2.4mcg/day" target={microTargets.vitaminB12} color="var(--ai-purple)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-seeding" label="Folate" value={Math.round(totals.folate)} unit="mcg" guideline="Guideline: 400mcg/day" target={microTargets.folate} color="var(--water-blue)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-battery" label="Magnesium" value={round1(totals.magnesium)} unit="mg" guideline="Guideline: 310–420mg/day" target={microTargets.magnesium} color="var(--accent)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-shield" label="Zinc" value={round1(totals.zinc)} unit="mg" guideline="Guideline: 8–11mg/day" target={microTargets.zinc} color="var(--gold)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-fish" label="Polyunsaturated fat" value={round1(totals.polyunsaturatedFat)} unit="g" guideline="A source of essential fatty acids" target={microTargets.polyunsaturatedFat} color="var(--water-blue)" />
                <MicroCard locked={!isPremium} onUpgrade={goUpgrade} icon="ti-droplet-half-2" label="Monounsaturated fat" value={round1(totals.monounsaturatedFat)} unit="g" guideline="Guideline: favour over saturated fat" target={microTargets.monounsaturatedFat} color="var(--ai-purple)" />
              </div>

              {logs.length === 0 && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
                  {isToday ? 'Nothing logged today yet — log some food to see your full nutrient breakdown here.' : 'Nothing logged on this day.'}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
