import Card from './Card';
import { formatSleep } from '../lib/dayCheckin';

// Expenditure's "This week": the last seven days at a glance, from
// lib/weeklySummary.js. A fixed rolling week, independent of the page's range
// picker below it.

const signed = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toLocaleString()}`;

function Stat({ label, value, hint }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 700, lineHeight: 1, color: value === '—' ? 'var(--text-hint)' : 'var(--text-primary)', overflowWrap: 'anywhere' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6, lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function feelParts(feel) {
  if (!feel) return [];
  return [
    feel.mood != null && `Mood ${feel.mood}/5`,
    feel.energy != null && `Energy ${feel.energy}/5`,
    feel.sleepHours != null && `Sleep ${formatSleep(feel.sleepHours)} a night${feel.sleepQuality != null ? ` (quality ${feel.sleepQuality}/5)` : ''}`,
  ].filter(Boolean);
}

export default function ThisWeekCard({ summary }) {
  if (!summary) return null;
  const { daysLogged, avgCalories, avgProtein, daysOnTarget, avgTarget, caloriesVsLastWeek, weight, feel } = summary;
  const feelLine = feelParts(feel);

  let calorieHint = daysLogged ? `over ${daysLogged} logged ${daysLogged === 1 ? 'day' : 'days'}` : 'Nothing logged';
  if (caloriesVsLastWeek != null) calorieHint = `${caloriesVsLastWeek === 0 ? 'same as' : `${signed(caloriesVsLastWeek)} vs`} last week`;
  else if (avgTarget) calorieHint = `target ${avgTarget.toLocaleString()}`;

  return (
    <Card style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-primary)', marginBottom: 2 }}>This week</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>The last 7 days, including today</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '18px 16px' }}>
        <Stat label="Avg. calories" value={avgCalories != null ? avgCalories.toLocaleString() : '—'} hint={calorieHint} />
        <Stat label="Days logged" value={`${daysLogged}/7`} hint={daysOnTarget != null ? `${daysOnTarget} on target` : 'Set a calorie target to track this'} />
        <Stat label="Avg. protein" value={avgProtein != null ? `${avgProtein}g` : '—'} hint={avgProtein != null ? 'per logged day' : 'No data yet'} />
        <Stat
          label="Weight"
          value={weight ? `${signed(weight.change)} ${weight.unit}` : '—'}
          hint={weight ? `now ${weight.latest} ${weight.unit}` : 'Weigh in twice to see the change'}
        />
      </div>
      {feelLine.length > 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          {feelLine.join(' · ')}
        </div>
      )}
    </Card>
  );
}
