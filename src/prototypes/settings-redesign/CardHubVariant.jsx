import { useState } from 'react';
import { Toggle, Segmented, FieldRow, Slider, AVATAR } from './shared';
import { GOAL_OPTIONS, useMockSettings, pageShellStyle } from './mockData';

// Axis: personality / drill-down navigation. Large glanceable cards each
// show a real preview of that section's current state up front (not just
// a name) — you can often tell what's going on without opening anything.
// Tapping a card pushes into a focused, full-width detail view (like
// opening an app), instead of expanding in place or switching a tab —
// the most native-app-feeling of the three directions.

function SummaryCard({ icon, color, title, children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left', padding: '18px', borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit',
        background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
        display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-strong)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb, ${color} 15%, transparent)`,
          border: `1px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: 17, color }} />
        </div>
        <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 15 }} />
      </div>
      <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600 }}>{title}</div>
      {children}
    </button>
  );
}

function DetailHeader({ title, onBack }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <button onClick={onBack} style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className="ti ti-arrow-left" style={{ fontSize: 16 }} />
      </button>
      <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>
    </div>
  );
}

export default function CardHubVariant() {
  const s = useMockSettings();
  const [goal, setGoal] = useState(s.goal);
  const [activity, setActivity] = useState(s.activity);
  const [proteinPct, setProteinPct] = useState(s.proteinPct);
  const [fatPct, setFatPct] = useState(s.fatPct);
  const carbPct = Math.max(0, 100 - proteinPct - fatPct);
  const [reminderOn, setReminderOn] = useState(s.reminderOn);
  const [coachPass, setCoachPass] = useState(s.coachPass);
  const [theme, setTheme] = useState(s.theme);
  const [view, setView] = useState('hub'); // 'hub' | 'goals' | 'notifs' | 'coach' | 'account'

  if (view === 'goals') {
    return (
      <div style={pageShellStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
          <DetailHeader title="Goals & Targets" onBack={() => setView('hub')} />
          <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>Goal</p>
          <Segmented value={goal} onChange={setGoal} options={GOAL_OPTIONS} />
          <div style={{ margin: '16px 0 4px' }}>
            <FieldRow label="Activity level" hint="Used to estimate your daily energy use">
              <select value={activity} onChange={e => setActivity(e.target.value)} style={{ padding: '9px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' }}>
                <option value="sedentary">Sedentary</option>
                <option value="light">Lightly active</option>
                <option value="moderate">Moderately active</option>
                <option value="very">Very active</option>
              </select>
            </FieldRow>
          </div>
          <div style={{ textAlign: 'center', margin: '20px 0 16px' }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 34, fontWeight: 700, color: 'var(--accent)' }}>{s.calories.toLocaleString()}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 6 }}>kcal / day</span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Protein</span>
              <span style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>{proteinPct}%</span>
            </div>
            <Slider value={proteinPct} min={10} max={60} onChange={v => setProteinPct(Math.min(v, 100 - fatPct))} color="var(--accent)" />
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 500 }}>Fat</span>
              <span style={{ color: 'var(--ai-purple)', fontSize: 13, fontWeight: 600 }}>{fatPct}%</span>
            </div>
            <Slider value={fatPct} min={10} max={50} onChange={v => setFatPct(Math.min(v, 100 - proteinPct))} color="var(--ai-purple)" />
            <p style={{ color: 'var(--text-hint)', fontSize: 11, marginTop: 8 }}>Carbs fill the rest — {carbPct}%.</p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'notifs') {
    return (
      <div style={pageShellStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
          <DetailHeader title="Notifications" onBack={() => setView('hub')} />
          <FieldRow label="Daily reminder" hint={reminderOn ? `Nudges you at ${s.reminderTime}` : 'Nudge to log food'}>
            <Toggle on={reminderOn} onChange={setReminderOn} />
          </FieldRow>
          <FieldRow label="Water reminders" hint="Coming soon"><Toggle on={false} onChange={() => {}} /></FieldRow>
          <FieldRow label="Daily mood check-in" hint="Coming soon"><Toggle on={false} onChange={() => {}} /></FieldRow>
        </div>
      </div>
    );
  }

  if (view === 'coach') {
    return (
      <div style={pageShellStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
          <DetailHeader title="Coach Mode" onBack={() => setView('hub')} />
          <FieldRow label="Coach Pass" hint="Test toggle — real billing isn't wired up yet">
            <Toggle on={coachPass} onChange={setCoachPass} />
          </FieldRow>
          <FieldRow label="Coach Mode" hint={coachPass ? "See your clients' logged data" : 'Requires Coach Pass'}>
            <Toggle on={false} onChange={() => {}} />
          </FieldRow>
        </div>
      </div>
    );
  }

  if (view === 'account') {
    return (
      <div style={pageShellStyle}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
          <DetailHeader title="Account" onBack={() => setView('hub')} />
          <FieldRow label="Status" hint={`Guest mode · ${s.daysRemaining} days left`}>
            <span style={{ color: 'var(--accent)', fontSize: 13 }}>Upgrade →</span>
          </FieldRow>
          <FieldRow label="Theme" hint={theme === 'light' ? 'Light' : 'Dark'}>
            <div style={{ display: 'flex', gap: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 20, padding: 2 }}>
              {[{ id: 'dark', icon: 'ti-moon' }, { id: 'light', icon: 'ti-sun' }].map(opt => (
                <button key={opt.id} onClick={() => setTheme(opt.id)} style={{
                  display: 'flex', alignItems: 'center', padding: '7px 12px', borderRadius: 18, border: 'none',
                  background: theme === opt.id ? 'var(--accent)' : 'transparent',
                  color: theme === opt.id ? '#0f0f0f' : 'var(--text-muted)', cursor: 'pointer',
                }}>
                  <i className={`ti ${opt.icon}`} style={{ fontSize: 14 }} />
                </button>
              ))}
            </div>
          </FieldRow>
          <button style={{ marginTop: 16, padding: '9px 16px', background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 8, color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Exit guest session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={pageShellStyle}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <AVATAR initials="S" />
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: 17, fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>{s.name}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, padding: '3px 9px', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 20 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
              <span style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 600 }}>Guest · {s.daysRemaining} days left</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          <SummaryCard icon="ti-target" color="var(--accent)" title="Goals & Targets" onClick={() => setView('goals')}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{s.calories.toLocaleString()} kcal</span> · {GOAL_OPTIONS.find(g => g.value === goal)?.label}
            </div>
          </SummaryCard>

          <SummaryCard icon="ti-bell" color="var(--water-blue)" title="Notifications" onClick={() => setView('notifs')}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {reminderOn ? `Reminder at ${s.reminderTime}` : 'All off'}
            </div>
          </SummaryCard>

          <SummaryCard icon="ti-users" color="var(--ai-purple)" title="Coach Mode" onClick={() => setView('coach')}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {coachPass ? 'Pass active' : 'Not active'}
            </div>
          </SummaryCard>

          <SummaryCard icon="ti-user-circle" color="var(--gold)" title="Account" onClick={() => setView('account')}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              Guest · {theme === 'dark' ? 'Dark theme' : 'Light theme'}
            </div>
          </SummaryCard>
        </div>
      </div>
    </div>
  );
}
