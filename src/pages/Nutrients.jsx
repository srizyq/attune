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

function MicroCard({ icon, label, value, unit, guideline, color }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, background: color + '22', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>
          <i className={`ti ${icon}`} style={{ fontSize: 16 }} />
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
        {value}<span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 400 }}>{unit}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{guideline}</div>
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
  }), {
    cal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0, sodium: 0, sugar: 0,
    saturatedFat: 0, transFat: 0, cholesterol: 0, potassium: 0,
    addedSugar: 0, vitaminD: 0, calcium: 0, iron: 0,
  });

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
                <MicroCard icon="ti-leaf" label="Fibre" value={round1(totals.fibre)} unit="g" guideline="Guideline: 25–30g/day" color="var(--accent)" />
                <MicroCard icon="ti-droplet" label="Sodium" value={Math.round(totals.sodium)} unit="mg" guideline="Guideline: under 2,300mg/day" color="var(--water-blue)" />
                <MicroCard icon="ti-candy" label="Sugar" value={round1(totals.sugar)} unit="g" guideline="Guideline: under 50g/day" color="var(--gold)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Fat breakdown</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard icon="ti-droplet-filled" label="Saturated fat" value={round1(totals.saturatedFat)} unit="g" guideline="Guideline: under 20g/day" color="var(--gold)" />
                <MicroCard icon="ti-alert-triangle" label="Trans fat" value={round1(totals.transFat)} unit="g" guideline="Guideline: as low as possible" color="var(--ai-purple)" />
                <MicroCard icon="ti-egg" label="Cholesterol" value={Math.round(totals.cholesterol)} unit="mg" guideline="Guideline: under 300mg/day" color="var(--water-blue)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Vitamins &amp; minerals</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard icon="ti-candy" label="Added sugar" value={round1(totals.addedSugar)} unit="g" guideline="Guideline: under 25g/day" color="var(--gold)" />
                <MicroCard icon="ti-bolt" label="Potassium" value={Math.round(totals.potassium)} unit="mg" guideline="Guideline: 2,600–3,400mg/day" color="var(--accent)" />
                <MicroCard icon="ti-sun" label="Vitamin D" value={round1(totals.vitaminD)} unit="mcg" guideline="Guideline: 15mcg/day" color="var(--gold)" />
                <MicroCard icon="ti-bone" label="Calcium" value={Math.round(totals.calcium)} unit="mg" guideline="Guideline: 1,000mg/day" color="var(--water-blue)" />
                <MicroCard icon="ti-drop" label="Iron" value={round1(totals.iron)} unit="mg" guideline="Guideline: 8–18mg/day" color="var(--ai-purple)" />
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
