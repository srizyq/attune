import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';

// ─── Reusable bits ──────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-subtle)',
      border: '1px solid var(--border-default)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p style={{ color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 18px' }}>
      {children}
    </p>
  );
}

function FieldRow({ label, hint, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', padding: '12px 0', borderBottom: '1px solid var(--border-default)' }}>
      <div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '2px' }}>{hint}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function TextInput({ value, onChange, type = 'text', suffix, width = '120px' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width,
          padding: '9px 12px',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: '8px',
          color: 'var(--text-primary)',
          fontSize: '14px',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          outline: 'none',
        }}
        onFocus={e => (e.target.style.borderColor = 'var(--accent-dark)')}
        onBlur={e => (e.target.style.borderColor = 'var(--border-default)')}
      />
      {suffix && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{suffix}</span>}
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { user } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({ name: '', unit: 'metric', age: 30, weight: 70, height: 170 });

  useEffect(() => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      unit: profile.unit || 'metric',
      age: profile.age || 30,
      weight: profile.weight || 70,
      height: profile.height || 170,
    });
  }, [profile]);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const isGuest = !!user?.is_anonymous;
  const daysRemaining = user?.created_at
    ? Math.max(0, 7 - Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86400000))
    : 7;
  const initials = (form.name || 'A').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  const handleSave = async () => {
    await saveProfile({
      name: form.name,
      unit: form.unit,
      age: Number(form.age),
      weight: Number(form.weight),
      height: Number(form.height),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <AppNav active="profile" initials={initials} />

      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        {/* Top bar */}
        <div className="page-pad-top" style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px 16px',
          paddingTop: 20, paddingBottom: 20, borderBottom: '1px solid var(--border-default)',
          position: 'sticky', top: 0, background: 'var(--bg-primary)', zIndex: 10,
        }}>
          <div>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Profile
            </h2>
            <p style={{ color: 'var(--text-hint)', fontSize: '13px', margin: '2px 0 0' }}>Your personal details and body stats</p>
          </div>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 20px',
              background: saved ? 'var(--accent-bg)' : 'var(--accent)',
              border: `1px solid ${saved ? 'var(--border-active)' : 'var(--accent)'}`,
              borderRadius: '10px',
              color: saved ? 'var(--accent)' : '#0f0f0f',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif", transition: 'all 0.2s',
            }}
          >
            {saved ? '✓ Saved' : 'Save changes'}
          </button>
        </div>

        {/* Content */}
        <div className="page-pad">

          {/* Identity header */}
          <Card style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'var(--accent-bg)', border: '1px solid var(--accent-dark)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 700, color: 'var(--accent)', flexShrink: 0,
              fontFamily: "'Syne', sans-serif",
            }}>
              {initials}
            </div>
            <div>
              <div style={{ color: 'var(--text-primary)', fontSize: '20px', fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
                {form.name || 'Your name'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <span style={{
                  fontSize: '12px', padding: '3px 10px', borderRadius: '99px',
                  background: isGuest ? '#1a1410' : 'var(--accent-bg)',
                  border: `1px solid ${isGuest ? '#3a2e1e' : 'var(--border-active)'}`,
                  color: isGuest ? 'var(--warning)' : 'var(--accent)',
                }}>
                  {isGuest ? `Guest · ${daysRemaining} days left` : 'Member'}
                </span>
                {!isGuest && user?.email && <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{user.email}</span>}
              </div>
            </div>
          </Card>

          {/* Details + stats, side by side like the rest of the app */}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Your details</SectionLabel>
              <FieldRow label="Name">
                <TextInput value={form.name} onChange={v => set('name', v)} width="180px" />
              </FieldRow>
              <FieldRow label="Units">
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { value: 'metric',   label: 'Metric (kg/cm)' },
                    { value: 'imperial', label: 'Imperial (lb/in)' },
                  ].map(u => {
                    const sel = form.unit === u.value;
                    return (
                      <button
                        key={u.value}
                        onClick={() => set('unit', u.value)}
                        style={{
                          padding: '8px 12px',
                          background: sel ? 'var(--accent-bg)' : 'var(--bg-primary)',
                          border: `1px solid ${sel ? 'var(--border-active)' : 'var(--border-default)'}`,
                          borderRadius: '8px',
                          color: sel ? 'var(--accent)' : 'var(--text-muted)',
                          fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                          fontFamily: "'Plus Jakarta Sans', sans-serif",
                        }}
                      >
                        {u.label}
                      </button>
                    );
                  })}
                </div>
              </FieldRow>
            </Card>

            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Body stats</SectionLabel>
              <FieldRow label="Age">
                <TextInput value={form.age} onChange={v => set('age', v)} type="number" suffix="years" width="90px" />
              </FieldRow>
              <FieldRow label="Weight">
                <TextInput value={form.weight} onChange={v => set('weight', v)} type="number" suffix={form.unit === 'imperial' ? 'lb' : 'kg'} width="90px" />
              </FieldRow>
              <FieldRow label="Height">
                <TextInput value={form.height} onChange={v => set('height', v)} type="number" suffix={form.unit === 'imperial' ? 'in' : 'cm'} width="90px" />
              </FieldRow>
              <p style={{ color: 'var(--text-hint)', fontSize: '12px', margin: '14px 0 0' }}>
                These feed your calculated calorie target on the Goals tab in Settings.
              </p>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}
