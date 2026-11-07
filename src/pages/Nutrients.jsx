import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useProfile } from '../hooks/useProfile';
import { hasProAccess } from '../lib/proAccess';
import { useFoodLogs } from '../hooks/useFoodLogs';
import { todayLocalDate } from '../lib/patterns';
import AppNav from '../components/AppNav';
import MicroCard from '../components/MicroCard';
import { MICRO_NUTRIENTS, extendedCoverage, formatMicro } from '../lib/microNutrients';
import { estimateSummary, microNote } from '../lib/microEstimate';
import { useMicroEstimates } from '../hooks/useMicroEstimates';
import { MICRO_GROUPS } from '../components/coach/constants';
import { targetsForDate } from '../lib/dayTargets';
import PageHeader from '../components/PageHeader';
import DateStepper from '../components/DateStepper';
import Card from '../components/Card';
import StatBadge from '../components/StatBadge';
import { carbsToShow, carbsLabel } from '../lib/dietStyles';
import SegToggle from '../components/SegToggle';
import SupplementsCard from '../components/SupplementsCard';
import { slotFor } from '../lib/daySlots';
import { useSupplements } from '../hooks/useSupplements';
import { useFoodLogsRange } from '../hooks/useFoodLogsRange';
import { targetsFor, targetFor, targetNote } from '../lib/nutrientTargets';
import { HEALTH_GOALS, LIMIT_KEYS } from '../lib/nutrientInfo';
import { contributorsFor } from '../lib/nutrientContributors';
import { averages, macroAverages, loggedDayCount, rangeDates } from '../lib/nutrientRange';

const BY_KEY = Object.fromEntries(MICRO_NUTRIENTS.map((m) => [m.key, m]));
const RANGES = [{ value: 'day', label: 'Day', days: 1 }, { value: '7', label: '7-day avg', days: 7 }, { value: '30', label: '30-day avg', days: 30 }];

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
  const [range, setRange] = useState('day');
  const [view, setView] = useState('type');
  // Each nutrient's target: the person's own, else the recommendation for their age and sex.
  const DEFAULT_TARGETS = useMemo(() => targetsFor(profile), [profile]);
  const guide = (key, fallback) => {
    const t = targetFor(key, profile);
    const n = BY_KEY[key];
    if (t.source !== 'personal') return fallback;
    return LIMIT_KEYS.has(key) ? `Aim for under ${t.value}${n.unit}/day` : `${targetNote('personal')}: ${t.value}${n.unit}/day`;
  };

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

  const { logs, meals, loading, addFood, daySlots } = useFoodLogs(selectedDate, { supplements: true });
  const supplementsApi = useSupplements();
  // The extended nutrients (B vitamins, selenium, ...) are only carried by some
  // food databases: sum just the foods that have them, and say how many did.
  const items = useMemo(() => Object.values(meals).flat(), [meals]);
  // Foods that came without vitamins and minerals (photo and menu scans, AI
  // estimates, many branded products) borrow them from the closest similar food;
  // the cards say so, and what was measured stays separate.
  const isPremium = hasProAccess(profile); // a Coach Pass includes Pro — see lib/proAccess.js
  const estimates = useMicroEstimates(items, { pro: isPremium });
  // 7- and 30-day averages: the days ending on the selected one, counting only days with something logged.
  const rangeDays = RANGES.find((r) => r.value === range).days;
  const isRange = range !== 'day';
  const rangeData = useFoodLogsRange(selectedDate, rangeDays, isRange);
  const rangeEstimates = useMicroEstimates(rangeData.items, { pro: isPremium, ai: false });
  const generic = isRange || view === 'goal';
  const summary = useMemo(() => estimateSummary(items, estimates), [items, estimates]);
  const itemsFilled = useMemo(() => items.map((item) => {
    const est = estimates.get(item.id)?.micros;
    if (!est) return item;
    const filled = { ...item };
    for (const [key, v] of Object.entries(est)) if (item[key] == null) filled[key] = v;
    return filled;
  }), [items, estimates]);
  const extended = useMemo(() => extendedCoverage(itemsFilled), [itemsFilled]);

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
  const goUpgrade = () => navigate('/pricing');
  // Each card opens its nutrient's own page: which foods supplied it today (Pro).
  const open = (key) => () => navigate(`/nutrients/${key}?date=${selectedDate}`);
  // Pro-only custom targets (Settings → Goals & Targets) — a nutrient
  // missing here just means "use the default guideline", handled inside
  // MicroCard itself.
  const microTargets = profile?.micro_targets || {};

  const round1 = n => Math.round(n * 10) / 10;

  // The figures behind the By-goal view and the averages: one entry per nutrient.
  const gItems = useMemo(() => (isRange ? rangeData.items : items.map((i) => ({ ...i, loggedDate: selectedDate }))), [isRange, rangeData.items, items, selectedDate]);
  const gEstimates = isRange ? rangeEstimates : estimates;
  const gDates = useMemo(() => (isRange ? rangeData.dates : rangeDates(selectedDate, 1)), [isRange, rangeData.dates, selectedDate]);
  const stat = useMemo(() => {
    if (!generic) return {};
    const avg = averages(MICRO_NUTRIENTS.map((m) => m.key), gItems, gEstimates, gDates);
    return Object.fromEntries(MICRO_NUTRIENTS.map((m) => {
      const c = contributorsFor(m.key, gItems, gEstimates);
      return [m.key, { avg: avg[m.key], noData: c.rows.length === 0 && c.unknown.length > 0, approx: c.estimatedTotal > 0 }];
    }));
  }, [generic, gItems, gEstimates, gDates]);
  const loggedDays = loggedDayCount(gItems);
  const macroAvg = useMemo(() => macroAverages(gItems, gDates), [gItems, gDates]);
  const rangeCarbs = loggedDays ? gItems.reduce((sum, i) => sum + carbsToShow(i.carbs, i.fibre, profile?.net_carbs), 0) / loggedDays : 0;
  const rangeLoading = isRange && rangeData.loading;
  const openKey = (key) => () => navigate(`/nutrients/${key}?date=${selectedDate}${isRange ? `&range=${range}` : ''}`);

  function card(key) {
    const n = BY_KEY[key];
    const st = stat[key] || { avg: 0, noData: false, approx: false };
    return (
      <MicroCard key={key} onOpen={openKey(key)} locked={n.pro && !isPremium} onUpgrade={goUpgrade} icon={n.icon} label={n.label} value={formatMicro(n, st.avg)} unit={n.unit} guideline={guide(key, n.guideline)} target={microTargets[key]} defaultTarget={DEFAULT_TARGETS[key]} color={n.color} noData={st.noData} approx={st.approx} />
    );
  }
  // "3 of 5 at 70%+ of target" for a goal's nutrients that have a target to reach.
  function goalSummary(keys) {
    const reach = keys.filter((k) => !LIMIT_KEYS.has(k) && (microTargets[k] || DEFAULT_TARGETS[k]) && !(BY_KEY[k].pro && !isPremium));
    if (!reach.length || (loggedDays === 0)) return null;
    const ok = reach.filter((k) => (stat[k]?.avg || 0) / (microTargets[k] || DEFAULT_TARGETS[k]) >= 0.7).length;
    return `${ok} of ${reach.length} at 70%+ of target`;
  }

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
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                <SegToggle label="Period" value={range} onChange={setRange} options={RANGES.map(({ value, label }) => ({ value, label }))} />
                <SegToggle label="Group by" value={view} onChange={setView} options={[{ value: 'type', label: 'By type' }, { value: 'goal', label: 'By goal' }]} />
              </div>
              {isRange && (
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.5 }}>
                  {rangeLoading ? 'Loading your logs…' : loggedDays === 0 ? `Nothing logged in these ${rangeDays} days.` : `Daily average over the ${loggedDays} of ${rangeDays} days you logged.`}
                </p>
              )}
              <Card style={{ padding: 24, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: 6 }}>{isRange ? 'Daily average calories' : isToday ? "Today's calories" : 'Calories'}</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 32, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 20 }}>
                  {Math.round(isRange ? macroAvg.cal : totals.cal).toLocaleString()}
                  {dayTargets.calories ? <span style={{ fontSize: 16, color: 'var(--text-muted)', fontWeight: 500 }}> / {dayTargets.calories.toLocaleString()} kcal</span> : ' kcal'}
                </div>
                <MacroRow label="Protein" value={round1(isRange ? macroAvg.protein : totals.protein)} unit="g" target={dayTargets.protein_g} color="var(--macro-protein)" />
                <MacroRow label={carbsLabel(profile?.net_carbs)} value={round1(isRange ? rangeCarbs : logs.reduce((sum, r) => sum + carbsToShow(r.carbs_g, r.fibre_g, profile?.net_carbs), 0))} unit="g" target={dayTargets.carbs_g} color="var(--macro-carbs)" />
                <MacroRow label="Fat" value={round1(isRange ? macroAvg.fat : totals.fat)} unit="g" target={dayTargets.fat_g} color="var(--macro-fat)" />
              </Card>

              {!isRange && supplementsApi.supported && (
                <SupplementsCard
                  supplements={supplementsApi.supplements} items={items} dayLabel={isToday ? 'today' : selectedDate}
                  onTake={(food) => {
                    // In Slots mode it goes into the slot that matches the time, like any other food.
                    const at = isToday ? new Date() : null;
                    const slotId = isPremium && (profile?.daily_log_view || 'meals') === 'slots' ? slotFor(daySlots, { at }) : null;
                    return addFood(food, undefined, at, slotId);
                  }}
                  onCreate={supplementsApi.create} onRemove={supplementsApi.remove}
                />
              )}
              {!generic && (<>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Other nutrients</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard onOpen={open('fibre')} icon="ti-leaf" label="Fibre" value={round1(totals.fibre)} unit="g" guideline={guide('fibre', "Guideline: 25–30g/day")} target={microTargets.fibre} defaultTarget={DEFAULT_TARGETS.fibre} color="var(--accent)" />
                <MicroCard onOpen={open('sodium')} icon="ti-droplet" label="Sodium" value={Math.round(totals.sodium)} unit="mg" guideline={guide('sodium', "Guideline: under 2,300mg/day")} target={microTargets.sodium} defaultTarget={DEFAULT_TARGETS.sodium} color="var(--water-blue)" />
                <MicroCard onOpen={open('sugar')} icon="ti-candy" label="Sugar" value={round1(totals.sugar)} unit="g" guideline={guide('sugar', "Guideline: under 50g/day")} target={microTargets.sugar} defaultTarget={DEFAULT_TARGETS.sugar} color="var(--gold)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Fat breakdown</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard {...est('saturatedFat')} onOpen={open('saturatedFat')} icon="ti-droplet-filled" label="Saturated fat" value={round1(tot('saturatedFat'))} unit="g" guideline={guide('saturatedFat', "Guideline: under 20g/day")} target={microTargets.saturatedFat} defaultTarget={DEFAULT_TARGETS.saturatedFat} color="var(--gold)" />
                <MicroCard {...est('transFat')} onOpen={open('transFat')} icon="ti-alert-triangle" label="Trans fat" value={round1(tot('transFat'))} unit="g" guideline={guide('transFat', "Guideline: as low as possible")} target={microTargets.transFat} color="var(--ai-purple)" />
                <MicroCard {...est('cholesterol')} onOpen={open('cholesterol')} icon="ti-egg" label="Cholesterol" value={Math.round(tot('cholesterol'))} unit="mg" guideline={guide('cholesterol', "Guideline: under 300mg/day")} target={microTargets.cholesterol} defaultTarget={DEFAULT_TARGETS.cholesterol} color="var(--water-blue)" />
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Vitamins &amp; minerals</div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard {...est('addedSugar')} onOpen={open('addedSugar')} icon="ti-candy" label="Added sugar" value={round1(tot('addedSugar'))} unit="g" guideline={guide('addedSugar', "Guideline: under 25g/day")} target={microTargets.addedSugar} defaultTarget={DEFAULT_TARGETS.addedSugar} color="var(--gold)" />
                <MicroCard {...est('potassium')} onOpen={open('potassium')} icon="ti-bolt" label="Potassium" value={Math.round(tot('potassium'))} unit="mg" guideline={guide('potassium', "Guideline: 2,600–3,400mg/day")} target={microTargets.potassium} defaultTarget={DEFAULT_TARGETS.potassium} color="var(--accent)" />
                <MicroCard {...est('vitaminD')} onOpen={open('vitaminD')} icon="ti-sun" label="Vitamin D" value={round1(tot('vitaminD'))} unit="mcg" guideline={guide('vitaminD', "Guideline: 15mcg/day")} target={microTargets.vitaminD} defaultTarget={DEFAULT_TARGETS.vitaminD} color="var(--gold)" />
                <MicroCard {...est('calcium')} onOpen={open('calcium')} icon="ti-bone" label="Calcium" value={Math.round(tot('calcium'))} unit="mg" guideline={guide('calcium', "Guideline: 1,000mg/day")} target={microTargets.calcium} defaultTarget={DEFAULT_TARGETS.calcium} color="var(--water-blue)" />
                <MicroCard {...est('iron')} onOpen={open('iron')} icon="ti-droplet" label="Iron" value={round1(tot('iron'))} unit="mg" guideline={guide('iron', "Guideline: 8–18mg/day")} target={microTargets.iron} defaultTarget={DEFAULT_TARGETS.iron} color="var(--ai-purple)" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>More micronutrients</span>
                {!isPremium && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
                )}
              </div>
              <div className="grid-3" style={{ marginBottom: 20 }}>
                <MicroCard {...est('vitaminA')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('vitaminA')} icon="ti-apple" label="Vitamin A" value={Math.round(tot('vitaminA'))} unit="mcg" guideline={guide('vitaminA', "Guideline: 700–900mcg/day")} target={microTargets.vitaminA} defaultTarget={DEFAULT_TARGETS.vitaminA} color="var(--gold)" />
                <MicroCard {...est('vitaminC')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('vitaminC')} icon="ti-lemon2" label="Vitamin C" value={round1(tot('vitaminC'))} unit="mg" guideline={guide('vitaminC', "Guideline: 45mg/day")} target={microTargets.vitaminC} defaultTarget={DEFAULT_TARGETS.vitaminC} color="var(--accent)" />
                <MicroCard {...est('vitaminB12')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('vitaminB12')} icon="ti-pill" label="Vitamin B12" value={round1(tot('vitaminB12'))} unit="mcg" guideline={guide('vitaminB12', "Guideline: 2.4mcg/day")} target={microTargets.vitaminB12} defaultTarget={DEFAULT_TARGETS.vitaminB12} color="var(--ai-purple)" />
                <MicroCard {...est('folate')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('folate')} icon="ti-seeding" label="Folate" value={Math.round(tot('folate'))} unit="mcg" guideline={guide('folate', "Guideline: 400mcg/day")} target={microTargets.folate} defaultTarget={DEFAULT_TARGETS.folate} color="var(--water-blue)" />
                <MicroCard {...est('magnesium')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('magnesium')} icon="ti-battery" label="Magnesium" value={round1(tot('magnesium'))} unit="mg" guideline={guide('magnesium', "Guideline: 310–420mg/day")} target={microTargets.magnesium} defaultTarget={DEFAULT_TARGETS.magnesium} color="var(--accent)" />
                <MicroCard {...est('zinc')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('zinc')} icon="ti-shield" label="Zinc" value={round1(tot('zinc'))} unit="mg" guideline={guide('zinc', "Guideline: 8–11mg/day")} target={microTargets.zinc} defaultTarget={DEFAULT_TARGETS.zinc} color="var(--gold)" />
                <MicroCard {...est('polyunsaturatedFat')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('polyunsaturatedFat')} icon="ti-fish" label="Polyunsaturated fat" value={round1(tot('polyunsaturatedFat'))} unit="g" guideline={guide('polyunsaturatedFat', "A source of essential fatty acids")} target={microTargets.polyunsaturatedFat} color="var(--water-blue)" />
                <MicroCard {...est('monounsaturatedFat')} locked={!isPremium} onUpgrade={goUpgrade} onOpen={open('monounsaturatedFat')} icon="ti-droplet-half-2" label="Monounsaturated fat" value={round1(tot('monounsaturatedFat'))} unit="g" guideline={guide('monounsaturatedFat', "Guideline: favour over saturated fat")} target={microTargets.monounsaturatedFat} color="var(--ai-purple)" />
              </div>

              {MICRO_GROUPS.filter(g => g.extended).map(group => (
                <div key={group.label} style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{group.label}</span>
                    {!isPremium && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-bg)', border: '1px solid var(--border-active)', borderRadius: 5, padding: '2px 6px', letterSpacing: '0.04em' }}>PRO</span>
                    )}
                  </div>
                  <div className="grid-3">
                    {group.keys.map(key => {
                      const n = MICRO_NUTRIENTS.find(m => m.key === key);
                      return (
                        <MicroCard key={key} onOpen={open(key)} {...est(key, false)} locked={!isPremium} onUpgrade={goUpgrade} icon={n.icon} label={n.label} value={formatMicro(n, extended[key].total)} unit={n.unit} guideline={guide(key, n.guideline)} target={microTargets[key]} defaultTarget={DEFAULT_TARGETS[key]} color={n.color} />
                      );
                    })}
                  </div>
                </div>
              ))}

              </>)}

              {generic && !rangeLoading && view === 'type' && MICRO_GROUPS.map((g) => (
                <div key={g.label} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{g.label}</div>
                  <div className="grid-3">{g.keys.map(card)}</div>
                </div>
              ))}
              {generic && !rangeLoading && view === 'goal' && HEALTH_GOALS.map((g) => (
                <div key={g.id} style={{ marginBottom: 20 }} data-testid={`goal-${g.id}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <i className={`ti ${g.icon}`} aria-hidden="true" style={{ fontSize: 16, color: 'var(--accent)' }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{g.label}</span>
                  </div>
                  {goalSummary(g.keys) && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{goalSummary(g.keys)}</div>}
                  <div className="grid-3" style={{ marginTop: goalSummary(g.keys) ? 0 : 10 }}>{g.keys.map(card)}</div>
                </div>
              ))}

              {(isRange ? (!rangeLoading && loggedDays === 0) : logs.length === 0) && (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
                  {isRange ? 'Nothing logged in this period.' : isToday ? 'Nothing logged today yet — log some food to see your full nutrient breakdown here.' : 'Nothing logged on this day.'}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
