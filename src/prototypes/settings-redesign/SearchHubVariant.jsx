import { useMemo, useRef, useState } from 'react';
import { Card, Toggle, Segmented, FieldRow, Slider, AVATAR } from './shared';
import { GOAL_OPTIONS, useMockSettings, pageShellStyle } from './mockData';

// Axis: discovery model. Settings are found by querying, not browsing —
// a search box filters individual settings by name (not just section
// titles), so "where's the protein slider" is a few keystrokes instead
// of knowing which tab to open. An empty search shows category tiles as
// a fallback entry point for someone who wants to browse instead.

const CATEGORIES = [
  { id: 'goals', icon: 'ti-target', label: 'Goals & Targets', color: 'var(--accent)' },
  { id: 'notifs', icon: 'ti-bell', label: 'Notifications', color: 'var(--water-blue)' },
  { id: 'coach', icon: 'ti-users', label: 'Coach Mode', color: 'var(--ai-purple)' },
  { id: 'account', icon: 'ti-user-circle', label: 'Account', color: 'var(--gold)' },
];

// The searchable index — one entry per individual setting, not per
// section, so a query like "protein" or "reminder" jumps straight to
// the control instead of just naming which tab it's on.
const INDEX = [
  { id: 'goal', category: 'goals', label: 'Weight goal', keywords: 'goal lose maintain build weight' },
  { id: 'activity', category: 'goals', label: 'Activity level', keywords: 'activity sedentary active exercise' },
  { id: 'calories', category: 'goals', label: 'Calorie target', keywords: 'calorie target kcal' },
  { id: 'protein', category: 'goals', label: 'Protein split', keywords: 'protein macro split percent' },
  { id: 'fat', category: 'goals', label: 'Fat split', keywords: 'fat macro split percent' },
  { id: 'reminder', category: 'notifs', label: 'Daily reminder', keywords: 'reminder notification nudge time' },
  { id: 'coachpass', category: 'coach', label: 'Coach Pass', keywords: 'coach pass trainer billing' },
  { id: 'theme', category: 'account', label: 'Theme', keywords: 'theme dark light appearance' },
  { id: 'logout', category: 'account', label: 'Log out', keywords: 'logout log out sign out exit guest' },
];

export default function SearchHubVariant() {
  const s = useMockSettings();
  const [goal, setGoal] = useState(s.goal);
  const [activity, setActivity] = useState(s.activity);
  const [proteinPct, setProteinPct] = useState(s.proteinPct);
  const [fatPct, setFatPct] = useState(s.fatPct);
  const carbPct = Math.max(0, 100 - proteinPct - fatPct);
  const [reminderOn, setReminderOn] = useState(s.reminderOn);
  const [coachPass, setCoachPass] = useState(s.coachPass);
  const [theme, setTheme] = useState(s.theme);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(null);
  const sectionRefs = useRef({});

  const results = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.trim().toLowerCase();
    return INDEX.filter(item => item.label.toLowerCase().includes(q) || item.keywords.includes(q));
  }, [query]);

  function jumpTo(categoryId) {
    setQuery('');
    setActiveCategory(categoryId);
    requestAnimationFrame(() => {
      sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  return (
    <div style={pageShellStyle}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 20px' }}>
        <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, margin: '0 0 16px' }}>Settings</h2>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <i className="ti ti-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-hint)', fontSize: 16 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search settings…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '13px 14px 13px 40px',
              background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12,
              color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {results ? (
          <div>
            {results.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>No settings match "{query}"</p>
            ) : results.map(r => {
              const cat = CATEGORIES.find(c => c.id === r.category);
              return (
                <button
                  key={r.id}
                  onClick={() => jumpTo(r.category)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10,
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', marginBottom: 8,
                  }}
                >
                  <i className={`ti ${cat.icon}`} style={{ fontSize: 16, color: cat.color, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500 }}>{r.label}</div>
                    <div style={{ color: 'var(--text-hint)', fontSize: 11, marginTop: 1 }}>{cat.label}</div>
                  </div>
                  <i className="ti ti-arrow-right" style={{ color: 'var(--text-hint)', fontSize: 14 }} />
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 24 }}>
            {CATEGORIES.map(c => (
              <button
                key={c.id}
                onClick={() => jumpTo(c.id)}
                style={{
                  padding: '18px 16px', background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
                  borderRadius: 14, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
              >
                <i className={`ti ${c.icon}`} style={{ fontSize: 22, color: c.color, marginBottom: 8, display: 'block' }} />
                <div style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>{c.label}</div>
              </button>
            ))}
          </div>
        )}

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

        <div ref={el => { sectionRefs.current.goals = el; }} style={{ scrollMarginTop: 20 }}>
          <Card style={{ marginBottom: 12, outline: activeCategory === 'goals' ? '2px solid var(--accent-dark)' : 'none', transition: 'outline 0.3s' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>Goals & Targets</p>
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
            <div style={{ textAlign: 'center', margin: '18px 0 16px' }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>{s.calories.toLocaleString()}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 13, marginLeft: 6 }}>kcal / day</span>
            </div>
            <div style={{ marginBottom: 14 }}>
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
          </Card>
        </div>

        <div ref={el => { sectionRefs.current.notifs = el; }} style={{ scrollMarginTop: 20 }}>
          <Card style={{ marginBottom: 12, outline: activeCategory === 'notifs' ? '2px solid var(--accent-dark)' : 'none', transition: 'outline 0.3s' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>Notifications</p>
            <FieldRow label="Daily reminder" hint={reminderOn ? `Nudges you at ${s.reminderTime}` : 'Nudge to log food'}>
              <Toggle on={reminderOn} onChange={setReminderOn} />
            </FieldRow>
          </Card>
        </div>

        <div ref={el => { sectionRefs.current.coach = el; }} style={{ scrollMarginTop: 20 }}>
          <Card style={{ marginBottom: 12, outline: activeCategory === 'coach' ? '2px solid var(--accent-dark)' : 'none', transition: 'outline 0.3s' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>Coach Mode</p>
            <FieldRow label="Coach Pass" hint="Test toggle — real billing isn't wired up yet">
              <Toggle on={coachPass} onChange={setCoachPass} />
            </FieldRow>
          </Card>
        </div>

        <div ref={el => { sectionRefs.current.account = el; }} style={{ scrollMarginTop: 20 }}>
          <Card style={{ marginBottom: 0, outline: activeCategory === 'account' ? '2px solid var(--accent-dark)' : 'none', transition: 'outline 0.3s' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 14px' }}>Account</p>
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
          </Card>
        </div>
      </div>
    </div>
  );
}
