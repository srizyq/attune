import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { hasProAccess } from '../lib/proAccess';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { todayLocalDate } from '../lib/patterns';
import AppNav from '../components/AppNav';
import MicroCard from '../components/MicroCard';
import { MICRO_NUTRIENTS, extendedCoverage, extendedNote, extendedSummary, formatMicro } from '../lib/microNutrients';
import { estimateSummary, microNote } from '../lib/microEstimate';
import { useMicroEstimates } from '../hooks/useMicroEstimates';
import { MICRO_GROUPS } from '../components/coach/constants';
import { targetsForDate } from '../lib/dayTargets';
import PageHeader from '../components/PageHeader';
import DateStepper from '../components/DateStepper';
import Card from '../components/Card';
import StatBadge from '../components/StatBadge';
import { carbsToShow, carbsLabel } from '../lib/dietStyles';

const DEFAULT_TARGETS = Object.fromEntries(MICRO_NUTRIENTS.map(m => [m.key, m.defaultTarget]));

function MacroRow({ label, value, unit, target, color }) {
  const pct = target ? (value / target) * 100 : null;
  const barPct = pct !== null ? Math.min(pct, 100) : null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
            {value}{unit}{target ? <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> / {target}{unit}</span> : null}
          </span>
          {pct !== null && <StatBadge color={color} style={{ padding: '2px 7px', fontSize: 11 }}>{Math.round(pct)}%</StatBadge>}
        </div>
      </div>
      {barPct !== null && (
        <div style={{ height: 6, background: 'var(--border-default)', borderRadius: 99 }}>
          <div style={{ height: '100%', width: `${barPct}%`, background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
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

  const { logs, meals, loading } = useFoodLogs(selectedDate);
  // The extended nutrients (B vitamins, selenium, ...) are only carried by some
  // food databases: sum just the foods that have them, and say how many did.
  const items = useMemo(() => Object.values(meals).flat(), [meals]);
  // Foods that came without vitamins and minerals (photo and menu scans, AI
  // estimates, many branded products) borrow them from the closest AUSNUT food;
  // the cards say so, and what was measured stays separate.
  const estimates = useMicroEstimates(items);
  const summary = useMemo(() => estimateSummary(items, estimates), [items, estimates]);
  const itemsFilled = useMemo(() => items.map((item) => {
    const est = estimates.get(item.id)?.micros;
    if (!est) return item;
    const filled = { ...item };
    for (const [key, v] of Object.entries(est)) if (item[key] == null) filled[key] = v;
    return filled;
  }), [items, estimates]);
  const extended = useMemo(() => extendedCoverage(itemsFilled), [itemsFilled]);
  const extendedInfo = useMemo(() => extendedSummary(items), [items]);

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

  // A total including estimates, and the note for its card.
  const tot = (key) => (totals[key] || 0) + (summary.perKey[key]?.estTotal || 0);
  const est = (key, withNote = true) => { const { note, noData, approx } = microNote(summary, key); return { note: withNote ? note : null, noData, approx }; };

  // The selected day's targets — a rest day can have its own (see lib/dayTargets.js).
  const dayTargets = targetsForDate(profile, selectedDate);
  const isPremium = hasProAccess(profile); // a Coach Pass includes Pro — see lib/proAccess.js
  const goUpgrade = () => navigate('/pricing');
  // Pro-only custom targets (Settings → Goals & Targets) — a nutrient
  // missing here just means "use the default guideline", handled inside
  // MicroCard itself.
  const microTargets = profile?.micro_targets || {};

  const round1 = n => Math.round(n * 10) / 10;

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="dashboard" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Nutrients" onBack={() => navigate('/dashboard')} backLabel="Back to Dashboard">
          <DateStepper selectedDate={selectedDate} isToday={isToday} onShift={shiftDate} />
        </PageHeader>

        <div className="page-pad" style={{ maxWidth: 700 }}>
          {loading ? null : (
            <>
              <Card style={{ padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: 6 }}>{isToday ? "Today's calories" : 'Calories'}</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
                  {Math.round(totals.cal).toLocaleString()}
                  {dayTargets.calories ? <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}> / {dayTargets.calories.toLocaleString()} kcal</span> : ' kcal'}
                </div>
                <MacroRow label="Protein" value={round1(totals.protein)} unit="g" target={dayTargets.protein_g} color="var(--macro-protein)" />
                <MacroRow label={carbsLabel(profile?.net_carbs)} value={round1(logs.reduce((sum, r) => sum + carbsToShow(r.carbs_g, r.fibre_g, profile?.net_carbs), 0))} unit="g" target={dayTargets.carbs_g} color="var(--macro-carbs)" />
                <MacroRow label="Fat" value={round1(totals.fat)} unit="g" target={dayTargets.fat_g} color="var(--macro-fat)" />
              </Card>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Other nutrients</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard icon="ti-leaf" label="Fibre" value={round1(totals.fibre)} unit="g" guideline="Guideline: 25–30g/day" target={microTargets.fibre} defaultTarget={DEFAULT_TARGETS.fibre} color="var(--accent)" />
                <MicroCard icon="ti-droplet" label="Sodium" value={Math.round(totals.sodium)} unit="mg" guideline="Guideline: under 2,300mg/day" target={microTargets.sodium} defaultTarget={DEFAULT_TARGETS.sodium} color="var(--water-blue)" />
                <MicroCard icon="ti-candy" label="Sugar" value={round1(totals.sugar)} unit="g" guideline="Guideline: under 50g/day" target={microTargets.sugar} defaultTarget={DEFAULT_TARGETS.sugar} color="var(--gold)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Fat breakdown</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard {...est('saturatedFat')} icon="ti-droplet-filled" label="Saturated fat" value={round1(tot('saturatedFat'))} unit="g" guideline="Guideline: under 20g/day" target={microTargets.saturatedFat} defaultTarget={DEFAULT_TARGETS.saturatedFat} color="var(--gold)" />
                <MicroCard {...est('transFat')} icon="ti-alert-triangle" label="Trans fat" value={round1(tot('transFat'))} unit="g" guideline="Guideline: as low as possible" target={microTargets.transFat} color="var(--ai-purple)" />
                <MicroCard {...est('cholesterol')} icon="ti-egg" label="Cholesterol" value={Math.round(tot('cholesterol'))} unit="mg" guideline="Guideline: under 300mg/day" target={microTargets.cholesterol} defaultTarget={DEFAULT_TARGETS.cholesterol} color="var(--water-blue)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Vitamins &amp; minerals</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard {...est('addedSugar')} icon="ti-candy" label="Added sugar" value={round1(tot('addedSugar'))} unit="g" guideline="Guideline: under 25g/day" target={microTargets.addedSugar} defaultTarget={DEFAULT_TARGETS.addedSugar} color="var(--gold)" />
                <MicroCard {...est('potassium')} icon="ti-bolt" label="Potassium" value={Math.round(tot('potassium'))} unit="mg" guideline="Guideline: 2,600–3,400mg/day" target={microTargets.potassium} defaultTarget={DEFAULT_TARGETS.potassium} color="var(--accent)" />
                <MicroCard {...est('vitaminD')} icon="ti-sun" label="Vitamin D" value={round1(tot('vitaminD'))} unit="mcg" guideline="Guideline: 15mcg/day" target={microTargets.vitaminD} defaultTarget={DEFAULT_TARGETS.vitaminD} color="var(--gold)" />
                <MicroCard {...est('calcium')} icon="ti-bone" label="Calcium" value={Math.round(tot('calcium'))} unit="mg" guideline="Guideline: 1,000mg/day" target={microTargets.calcium} defaultTarget={DEFAULT_TARGETS.calcium} color="var(--water-blue)" />
                <MicroCard {...est('iron')} icon="ti-droplet" label="Iron" value={round1(tot('iron'))} unit="mg" guideline="Guideline: 8–18mg/day" target={microTargets.iron} defaultTarget={DEFAULT_TARGETS.iron} color="var(--ai-purple)" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>More micronutrients</span>
                {!isPremium && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
                )}
              </div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard {...est('vitaminA')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-apple" label="Vitamin A" value={Math.round(tot('vitaminA'))} unit="mcg" guideline="Guideline: 700–900mcg/day" target={microTargets.vitaminA} defaultTarget={DEFAULT_TARGETS.vitaminA} color="var(--gold)" />
                <MicroCard {...est('vitaminC')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-lemon2" label="Vitamin C" value={round1(tot('vitaminC'))} unit="mg" guideline="Guideline: 45mg/day" target={microTargets.vitaminC} defaultTarget={DEFAULT_TARGETS.vitaminC} color="var(--accent)" />
                <MicroCard {...est('vitaminB12')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-pill" label="Vitamin B12" value={round1(tot('vitaminB12'))} unit="mcg" guideline="Guideline: 2.4mcg/day" target={microTargets.vitaminB12} defaultTarget={DEFAULT_TARGETS.vitaminB12} color="var(--ai-purple)" />
                <MicroCard {...est('folate')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-seeding" label="Folate" value={Math.round(tot('folate'))} unit="mcg" guideline="Guideline: 400mcg/day" target={microTargets.folate} defaultTarget={DEFAULT_TARGETS.folate} color="var(--water-blue)" />
                <MicroCard {...est('magnesium')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-battery" label="Magnesium" value={round1(tot('magnesium'))} unit="mg" guideline="Guideline: 310–420mg/day" target={microTargets.magnesium} defaultTarget={DEFAULT_TARGETS.magnesium} color="var(--accent)" />
                <MicroCard {...est('zinc')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-shield" label="Zinc" value={round1(tot('zinc'))} unit="mg" guideline="Guideline: 8–11mg/day" target={microTargets.zinc} defaultTarget={DEFAULT_TARGETS.zinc} color="var(--gold)" />
                <MicroCard {...est('polyunsaturatedFat')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-fish" label="Polyunsaturated fat" value={round1(tot('polyunsaturatedFat'))} unit="g" guideline="A source of essential fatty acids" target={microTargets.polyunsaturatedFat} color="var(--water-blue)" />
                <MicroCard {...est('monounsaturatedFat')} locked={!isPremium} onUpgrade={goUpgrade} icon="ti-droplet-half-2" label="Monounsaturated fat" value={round1(tot('monounsaturatedFat'))} unit="g" guideline="Guideline: favour over saturated fat" target={microTargets.monounsaturatedFat} color="var(--ai-purple)" />
              </div>

              {MICRO_GROUPS.filter(g => g.extended).map(group => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{group.label}</span>
                    {!isPremium && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
                    )}
                  </div>
                  {extendedNote(extendedInfo) && <p style={{ fontSize: 11, color: 'var(--text-hint)', margin: '0 0 10px', lineHeight: 1.5 }}>{extendedNote(extendedInfo)}{group.keys.some((k) => summary.perKey[k]?.estimated > 0) ? ' Foods without data borrow it from the closest AUSNUT food — totals marked ~ include those estimates.' : ''}</p>}
                  <div className="grid-3">
                    {group.keys.map(key => {
                      const n = MICRO_NUTRIENTS.find(m => m.key === key);
                      return (
                        <MicroCard key={key} {...est(key, false)} locked={!isPremium} onUpgrade={goUpgrade} icon={n.icon} label={n.label} value={formatMicro(n, extended[key].total)} unit={n.unit} guideline={n.guideline} target={microTargets[key]} defaultTarget={n.defaultTarget} color={n.color} />
                      );
                    })}
                  </div>
                </div>
              ))}

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
