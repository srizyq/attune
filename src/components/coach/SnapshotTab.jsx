import { useRef, useState } from 'react';
import DayHeatmapStrip from '../DayHeatmapStrip';
import MacroSplitBar from '../MacroSplitBar';
import DaySummary from '../DaySummary';
import TargetsForm from './TargetsForm';
import MicroTargetsCard from './MicroTargetsCard';
import CoCoachCard from './CoCoachCard';
import TargetsOwnership from './TargetsOwnership';
import NeedsAttention from './NeedsAttention';
import WeekTiles from './WeekTiles';
import { Card, SectionLabel, CardHeader, CardAction, StatRow, EmptyChartBox } from './shared';
import { ACCENT, GOAL_LABELS } from './constants';
import { dayTargetsActive, describeTrainingDays, TARGET_FIELDS } from '../../lib/dayTargets';

const stat = { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 };

function Avg({ label, value, hint }) {
  return (
    <div style={stat}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 20, fontWeight: 800, color: value === '—' ? 'var(--text-hint)' : 'var(--text-primary)' }}>{value}</span>
      <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{hint}</span>
    </div>
  );
}

// The one screen a coach needs most days: what needs them, how today and the
// week are going, and the targets — in about two phone screens. Everything is
// said once; the longer history lives under Diary and Progress, and the rarely
// changed settings are tucked under "More".
export default function SnapshotTab({ clientData, d, editingTargets, setEditingTargets, onSaveTargets, onSaveMicroTargets, summary, readOnly = false, onMessage }) {
  const { calorieTarget, historyLoading, calorieHeatmapDays } = d;
  const restActive = dayTargetsActive(clientData);
  const { hasData, loggedDays, energyDays, avgCalories, avgProtein, avgCarbs, avgFat, avgEnergy } = d.stats;
  const { logging: loggingStreak, calorie: calorieStreak, mood: moodStreak, protein: proteinStreak } = d.streaks;
  const [moreOpen, setMoreOpen] = useState(false);
  const goalRef = useRef(null);

  const adjustTargets = () => {
    setEditingTargets(true);
    goalRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const macros = [clientData.protein_g && `P ${clientData.protein_g}g`, clientData.carbs_g && `C ${clientData.carbs_g}g`, clientData.fat_g && `F ${clientData.fat_g}g`].filter(Boolean).join(' · ');
  const otherStreaks = [['Calorie target', calorieStreak], ['Protein target', proteinStreak], ['Check-ins', moodStreak]].filter(([, n]) => n > 0);

  return (
    <div>
      <NeedsAttention summary={summary} today={d.today} clientName={clientData.name} onMessage={onMessage} onAdjustTargets={adjustTargets} readOnly={readOnly} />

      <Card>
        <SectionLabel icon="ti-chart-donut">Today</SectionLabel>
        {historyLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
        ) : d.todayTotals?.calories > 0 ? (
          <DaySummary totals={d.todayTotals} targets={d.todayTargets} />
        ) : (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Nothing logged yet today.</p>
        )}
      </Card>

      <WeekTiles summary={summary} clientData={clientData} today={d.today} />

      <div ref={goalRef} style={{ scrollMarginTop: 80 }}>
        <Card>
          <CardHeader icon="ti-target" action={!editingTargets && !readOnly ? <CardAction onClick={() => setEditingTargets(true)} icon="ti-pencil">Edit</CardAction> : undefined}>Goal &amp; targets</CardHeader>
          {editingTargets ? (
            <TargetsForm client={clientData} onSave={onSaveTargets} onCancel={() => setEditingTargets(false)} />
          ) : (
            <>
              <StatRow label="Goal" value={GOAL_LABELS[clientData.goal] || '—'} />
              <StatRow label="Calories" value={calorieTarget ? `${calorieTarget.toLocaleString()} kcal` : '—'} />
              <StatRow label="Macros" value={macros || '—'} />
              {restActive && (
                <>
                  <StatRow label="Training days" value={describeTrainingDays(clientData.training_days)} />
                  <StatRow label="Rest days" value={TARGET_FIELDS.filter(f => clientData.rest_day_targets[f.key] != null).map(f => `${f.label} ${Number(clientData.rest_day_targets[f.key]).toLocaleString()}${f.unit === 'g' ? 'g' : ' kcal'}`).join(' · ')} />
                </>
              )}
              <TargetsOwnership clientData={clientData} />
            </>
          )}
        </Card>
      </div>

      <Card>
        <SectionLabel icon="ti-chart-line">{`Intake · last ${d.range} days`}</SectionLabel>
        {historyLoading ? null : hasData ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 16 }}>
              <Avg label="Avg kcal" value={avgCalories.toLocaleString()} hint={`${loggedDays.length} logged day${loggedDays.length === 1 ? '' : 's'}`} />
              <Avg label="Avg protein" value={`${avgProtein}g`} hint="per logged day" />
              <Avg label="Avg energy" value={avgEnergy || '—'} hint={avgEnergy ? `${energyDays.length} check-in${energyDays.length === 1 ? '' : 's'}` : 'no check-ins'} />
            </div>
            <DayHeatmapStrip days={calorieHeatmapDays} color={ACCENT} />
            <div style={{ marginTop: 16 }}><MacroSplitBar protein={avgProtein} carbs={avgCarbs} fat={avgFat} /></div>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '14px 0 0', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <i className="ti ti-flame" aria-hidden="true" style={{ color: 'var(--burn)' }} />
              <span>Logging streak: {loggingStreak} day{loggingStreak === 1 ? '' : 's'}</span>
              {otherStreaks.map(([label, n]) => <span key={label}>· {label} {n}</span>)}
            </p>
          </>
        ) : (
          <EmptyChartBox icon="ti-chart-line" message={`No logged days in the last ${d.range} days`} />
        )}
      </Card>

      {!readOnly && (
        <>
          <button
            type="button"
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            className="btn-press"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', minHeight: 52, padding: '0 20px', marginBottom: 16, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 16, color: 'var(--text-primary)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            <span>Nutrient targets &amp; coaching team</span>
            <i className={`ti ti-chevron-${moreOpen ? 'up' : 'down'}`} aria-hidden="true" style={{ color: 'var(--text-hint)' }} />
          </button>
          {moreOpen && (
            <>
              <MicroTargetsCard clientData={clientData} onSave={onSaveMicroTargets} />
              <CoCoachCard clientId={clientData.id} clientName={clientData.name} />
            </>
          )}
        </>
      )}
    </div>
  );
}
