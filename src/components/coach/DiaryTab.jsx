import { useState } from 'react';
import DaySelector from '../DaySelector';
import LogItemRow from '../LogItemRow';
import MicroCard from '../MicroCard';
import { Card, SectionLabel, StatRow } from './shared';
import WorkoutsCard from './WorkoutsCard';
import { MEAL_LABELS, MICRO_GROUPS } from './constants';
import { MICRO_NUTRIENTS } from '../../lib/microNutrients';
import { round1 } from '../../lib/format';

// One day at a time: what they ate (with the full micronutrient breakdown),
// how they said they felt, and what training they did.
export default function DiaryTab({ d }) {
  const [open, setOpen] = useState({ breakfast: true, lunch: true, dinner: true, snacks: true });
  const [expandedId, setExpandedId] = useState(null);
  const { meals, foodLoading, checkin, microTotals, microTargets, hasAnyFood, date, setDate } = d;
  const dayWorkouts = d.workouts.filter(w => w.date === date);

  return (
    <div>
      <div style={{ margin: '0 0 16px' }}>
        <DaySelector selectedDate={date} onSelect={(day) => { setDate(day); setExpandedId(null); }} />
      </div>

      <div className="grid-2" style={{ alignItems: 'start', marginBottom: 16 }}>
        <Card style={{ marginBottom: 0 }}>
          <SectionLabel icon="ti-clipboard-list">Food log — {date}</SectionLabel>
          {foodLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(meals).map(([mealKey, items]) => {
                const mealTotal = Math.round(items.reduce((s, i) => s + i.cal, 0));
                const mealProtein = round1(items.reduce((s, i) => s + i.protein, 0));
                const mealCarbs = round1(items.reduce((s, i) => s + i.carbs, 0));
                const mealFat = round1(items.reduce((s, i) => s + i.fat, 0));
                const isOpen = open[mealKey];
                return (
                  <div key={mealKey} style={{ background: 'var(--bg-primary)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, overflow: 'hidden' }}>
                    <button onClick={() => setOpen(o => ({ ...o, [mealKey]: !o[mealKey] }))} className="btn-press" style={{ width: '100%', background: 'none', border: 'none', padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 15, color: 'var(--text-secondary)' }}>{MEAL_LABELS[mealKey]}</div>
                        {items.length > 0 && <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>P {mealProtein}g · C {mealCarbs}g · F {mealFat}g</div>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{mealTotal} kcal</span>
                        <span style={{ color: 'var(--text-hint)', fontSize: 12, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div style={{ borderTop: '1px solid var(--border-default)' }}>
                        {items.length === 0 ? (
                          <p style={{ color: 'var(--text-hint)', fontSize: 13, padding: '14px 18px' }}>Nothing logged</p>
                        ) : (
                          items.map(item => (
                            <LogItemRow
                              key={item.id}
                              item={item}
                              isExpanded={expandedId === item.id}
                              onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
                              readOnly
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div>
          <Card>
            <SectionLabel icon="ti-mood-smile">Check-in — {date}</SectionLabel>
            {checkin ? (
              <>
                <StatRow label="Mood" value={checkin.mood || '—'} />
                <StatRow label="Energy" value={checkin.energy ? `${checkin.energy}/10` : '—'} />
                <StatRow label="Water" value={`${checkin.water_glasses || 0} glasses`} />
                {checkin.note && <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '10px 0 0' }}>{checkin.note}</p>}
              </>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No check-in logged this day.</p>
            )}
          </Card>
          <WorkoutsCard title={`Workouts \u2014 ${date}`} workouts={dayWorkouts} loading={d.workoutsLoading} style={{ marginBottom: 0 }} />
        </div>
      </div>

      <Card style={{ marginBottom: 0 }}>
        <SectionLabel icon="ti-apple">Micronutrients — {date}</SectionLabel>
        {foodLoading ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
        ) : !hasAnyFood ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nothing logged this day.</p>
        ) : (
          MICRO_GROUPS.map((group, gi) => (
            <div key={group.label} style={{ marginBottom: gi < MICRO_GROUPS.length - 1 ? 20 : 0 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>{group.label}</div>
              <div className="grid-3">
                {group.keys.map(key => {
                  const n = MICRO_NUTRIENTS.find(m => m.key === key);
                  return (
                    <MicroCard
                      key={key}
                      icon={n.icon}
                      label={n.label}
                      value={n.unit === 'g' || n.unit === 'mg' ? round1(microTotals[key]) : Math.round(microTotals[key])}
                      unit={n.unit}
                      guideline={n.guideline}
                      target={microTargets[key]}
                      defaultTarget={n.defaultTarget}
                      color={n.color}
                    />
                  );
                })}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
