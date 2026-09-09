import { useState } from 'react';
import { Toggle, Segmented, FieldRow, Slider, AVATAR } from './shared';
import { GOAL_OPTIONS, useMockSettings, pageShellStyle } from './mockData';

// Axis: navigation model. No tabs — every section title is visible at
// once as a collapsible row (iOS Settings-style grouped list), each
// expanding in place. You never have to remember which tab a setting
// lives under, or switch away from one section to check another's name.
function AccordionSection({ id, icon, title, summary, isOpen, onToggle, children }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: '14px', overflow: 'hidden', marginBottom: 10 }}>
      <button
        onClick={() => onToggle(id)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
        }}
      >
        <div style={{
          width: 38, height: 38, borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--accent-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <i className={`ti ${icon}`} style={{ fontSize: 18, color: 'var(--accent)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>{title}</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{summary}</div>
        </div>
        <span style={{
          color: 'var(--text-hint)', fontSize: 12, display: 'inline-block', flexShrink: 0,
          transition: 'transform 220ms cubic-bezier(0.77, 0, 0.175, 1)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▼</span>
      </button>
      <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', transition: 'grid-template-rows 220ms cubic-bezier(0.77, 0, 0.175, 1)' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '4px 18px 20px', borderTop: '1px solid var(--border-default)' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GroupedListVariant() {
  const s = useMockSettings();
  const [goal, setGoal] = useState(s.goal);
  const [activity, setActivity] = useState(s.activity);
  const [proteinPct, setProteinPct] = useState(s.proteinPct);
  const [fatPct, setFatPct] = useState(s.fatPct);
  const carbPct = Math.max(0, 100 - proteinPct - fatPct);
  const [reminderOn, setReminderOn] = useState(s.reminderOn);
  const [coachPass, setCoachPass] = useState(s.coachPass);
  const [theme, setTheme] = useState(s.theme);
  const [openId, setOpenId] = useState('goals');

  const toggleSection = (id) => setOpenId(cur => cur === id ? null : id);

  return (
    <div style={pageShellStyle}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Settings</h2>
        <p style={{ color: 'var(--text-hint)', fontSize: 13, margin: '0 0 20px' }}>Tap a section to open it</p>

        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
          background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 14,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', marginBottom: 20,
        }}>
          <AVATAR initials="S" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 600 }}>{s.name}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Guest mode · {s.daysRemaining} days left</div>
          </div>
          <i className="ti ti-chevron-right" style={{ color: 'var(--text-hint)', fontSize: 16 }} />
        </button>

        <AccordionSection
          id="goals" icon="ti-target" title="Goals & Targets"
          summary={`${s.calories.toLocaleString()} kcal · ${GOAL_OPTIONS.find(g => g.value === goal)?.label}`}
          isOpen={openId === 'goals'} onToggle={toggleSection}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '14px 0 12px' }}>Goal</p>
          <Segmented value={goal} onChange={setGoal} options={GOAL_OPTIONS} />
          <div style={{ marginTop: 16, marginBottom: 4 }}>
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
        </AccordionSection>

        <AccordionSection
          id="notifs" icon="ti-bell" title="Notifications"
          summary={reminderOn ? `Daily reminder at ${s.reminderTime}` : 'All reminders off'}
          isOpen={openId === 'notifs'} onToggle={toggleSection}
        >
          <div style={{ paddingTop: 14 }}>
            <FieldRow label="Daily reminder" hint={reminderOn ? `Nudges you at ${s.reminderTime} if you haven't logged yet` : 'Nudge to log food if you haven’t yet'}>
              <Toggle on={reminderOn} onChange={setReminderOn} />
            </FieldRow>
            <FieldRow label="Water reminders" hint="Coming soon"><Toggle on={false} onChange={() => {}} /></FieldRow>
            <FieldRow label="Daily mood check-in" hint="Coming soon"><Toggle on={false} onChange={() => {}} /></FieldRow>
          </div>
        </AccordionSection>

        <AccordionSection
          id="coach" icon="ti-users" title="Coach Mode"
          summary={coachPass ? 'Coach Pass active' : 'Not active'}
          isOpen={openId === 'coach'} onToggle={toggleSection}
        >
          <div style={{ paddingTop: 14 }}>
            <FieldRow label="Coach Pass" hint="Test toggle — real billing isn't wired up yet">
              <Toggle on={coachPass} onChange={setCoachPass} />
            </FieldRow>
            <FieldRow label="Coach Mode" hint={coachPass ? "See your clients' logged data" : 'Requires Coach Pass'}>
              <Toggle on={false} onChange={() => {}} />
            </FieldRow>
          </div>
        </AccordionSection>

        <AccordionSection
          id="account" icon="ti-user-circle" title="Account"
          summary={`Guest mode · ${s.daysRemaining} days left`}
          isOpen={openId === 'account'} onToggle={toggleSection}
        >
          <div style={{ paddingTop: 14 }}>
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
        </AccordionSection>
      </div>
    </div>
  );
}
