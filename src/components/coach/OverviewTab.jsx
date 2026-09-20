import DayHeatmapStrip from '../DayHeatmapStrip';
import MacroSplitBar from '../MacroSplitBar';
import StreakItem from '../StreakItem';
import TargetsForm from './TargetsForm';
import { Card, SectionLabel, StatRow, StatCard, EmptyChartBox, RangeToggle } from './shared';
import { ACCENT, WATER_BLUE, AI_PURPLE, GOAL_LABELS, RANGES } from './constants';
import { attentionFlags } from '../../lib/clientInsights';

const SEVERITY_COLOR = { high: 'var(--danger)', medium: 'var(--gold)' };

// Why this client might need their coach's attention right now — the same
// flags the client list shows, spelled out at the top of their page.
function AttentionFlags({ summary, today }) {
  const flags = attentionFlags(summary, today);
  if (flags.length === 0) return null;
  return (
    <div role="status" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      {flags.map(f => (
        <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: 'var(--bg-card)', border: `1px solid ${SEVERITY_COLOR[f.severity]}`, color: SEVERITY_COLOR[f.severity], fontSize: 12, fontWeight: 600 }}>
          <i className="ti ti-alert-circle" style={{ fontSize: 13 }} />
          {f.label}
        </span>
      ))}
    </div>
  );
}

export default function OverviewTab({ clientData, d, editingTargets, setEditingTargets, onSaveTargets, summary }) {
  const handleSaveTargets = onSaveTargets;
  const { calorieTarget, historyLoading, calorieHeatmapDays } = d;
  const { hasData, loggedDays, energyDays, avgCalories, avgProtein, avgCarbs, avgFat, daysOnTarget, avgEnergy } = d.stats;
  const { logging: loggingStreak, calorie: calorieStreak, mood: moodStreak, protein: proteinStreak } = d.streaks;

  return (
    <div>
      <AttentionFlags summary={summary} today={d.today} />
      <div className="grid-2" style={{ marginBottom: 16, alignItems: 'start' }}>
        <Card style={{ marginBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <SectionLabel icon="ti-target">Goal &amp; targets</SectionLabel>
            {!editingTargets && (
              <button
                onClick={() => setEditingTargets(true)}
                className="btn-press"
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", marginBottom: 18, display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <i className="ti ti-pencil" style={{ fontSize: 12 }} /> Edit
              </button>
            )}
          </div>
          {editingTargets ? (
            <TargetsForm client={clientData} onSave={handleSaveTargets} onCancel={() => setEditingTargets(false)} />
          ) : (
            <>
              <StatRow label="Goal" value={GOAL_LABELS[clientData.goal] || '—'} />
              <StatRow label="Calorie target" value={calorieTarget ? `${calorieTarget.toLocaleString()} kcal` : '—'} />
              <StatRow label="Protein" value={clientData.protein_g ? `${clientData.protein_g}g` : '—'} />
              <StatRow label="Carbs" value={clientData.carbs_g ? `${clientData.carbs_g}g` : '—'} />
              <StatRow label="Fat" value={clientData.fat_g ? `${clientData.fat_g}g` : '—'} />
            </>
          )}
        </Card>
        <div className="grid-2" style={{ gap: 12 }}>
          <StatCard label="Avg. calories" value={hasData ? avgCalories.toLocaleString() : '—'} hint={hasData ? `over ${loggedDays.length} logged days` : 'No data yet'} color={ACCENT} />
          <StatCard label="Days on target" value={hasData && calorieTarget ? daysOnTarget : '—'} hint={calorieTarget ? 'within 10% of goal' : 'No calorie target set'} color={ACCENT} />
          <StatCard label="Avg. protein" value={hasData ? `${avgProtein}g` : '—'} hint={hasData ? `over ${loggedDays.length} logged days` : 'No data yet'} color={WATER_BLUE} />
          <StatCard label="Avg. energy" value={avgEnergy || '—'} hint={avgEnergy ? `over ${energyDays.length} check-ins` : 'No check-ins yet'} color={AI_PURPLE} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <RangeToggle value={d.range} onChange={d.setRange} options={RANGES} />
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel icon="ti-chart-line">Calories vs goal</SectionLabel>
          {historyLoading ? null : hasData ? (
            <DayHeatmapStrip days={calorieHeatmapDays} color={ACCENT} />
          ) : (
            <EmptyChartBox icon="ti-chart-line" message="No logged days in this range" />
          )}
        </Card>
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel icon="ti-chart-bar">Macro breakdown</SectionLabel>
          {historyLoading ? null : hasData ? (
            <MacroSplitBar protein={avgProtein} carbs={avgCarbs} fat={avgFat} />
          ) : (
            <EmptyChartBox icon="ti-chart-bar" message="No logged days in this range" />
          )}
        </Card>
      </div>

      <Card>
        <SectionLabel icon="ti-flame">Streaks</SectionLabel>
        {[
          { icon: 'ti-flame', iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)', name: 'Logging streak', count: loggingStreak },
          { icon: 'ti-target', iconBg: 'var(--accent-bg)', iconColor: 'var(--accent)', name: 'Calorie target', count: calorieStreak },
          { icon: 'ti-meat', iconBg: WATER_BLUE + '18', iconColor: 'var(--water-blue)', name: 'Protein target', count: proteinStreak },
          { icon: 'ti-mood-smile', iconBg: AI_PURPLE + '18', iconColor: 'var(--ai-purple)', name: 'Mood check-ins', count: moodStreak },
        ].map((s, i, arr) => (
          <div key={s.name} style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
            <StreakItem {...s} />
          </div>
        ))}
      </Card>
    </div>
  );
}
