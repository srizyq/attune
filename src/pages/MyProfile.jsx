import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useProfile } from '../hooks/useProfile';
import AppNav from '../components/AppNav';
import { Card, SectionLabel, FieldRow } from '../components/settings/primitives';
import PageHeader from '../components/PageHeader';
import SegmentedControl from '../components/SegmentedControl';
import Avatar from '../components/Avatar';
import Toast from '../components/Toast';

// Profile: who you are — name, units, sex and body stats, all autosaved.
// Account (plan, theme, sign out, delete) is under Settings → Account.
const SEX_OPTIONS = [
  { id: 'male', label: 'Male' },
  { id: 'female', label: 'Female' },
  { id: 'unspecified', label: 'Other' },
];

const LIFE_STAGE_OPTIONS = [
  { id: 'none', label: 'No' },
  { id: 'pregnant', label: 'Pregnant' },
  { id: 'breastfeeding', label: 'Breastfeeding' },
];

const UNIT_OPTIONS = [
  { id: 'metric', label: 'Metric (kg/cm)' },
  { id: 'imperial', label: 'Imperial (lb/in)' },
];

// ─── Reusable bits ──────────────────────────────────────────────────────────────
// `onBlur` is optional and additional to the border-color reset below — the
// profile page uses it to flush a pending autosave the moment you tap away,
// instead of waiting out the debounce.
function TextInput({ value, onChange, onBlur, type = 'text', suffix, width = '120px', ariaLabel }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label={ariaLabel}
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
        onBlur={e => { e.target.style.borderColor = 'var(--border-default)'; onBlur?.(); }}
      />
      {/* Same-width unit column so the Age / Weight / Height boxes line up. */}
      {suffix && <span style={{ color: 'var(--text-muted)', fontSize: '13px', width: '40px' }}>{suffix}</span>}
    </div>
  );
}

const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 11px', borderRadius: 14, background: 'var(--bg-card)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' };

export default function MyProfile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, save: saveProfile } = useProfile();
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({ name: '', unit: 'metric', age: 30, weight: 70, height: 170 });
  // The last form snapshot that's either freshly loaded from `profile` or
  // already saved — compared against `form` to know whether there's
  // actually anything new to autosave, so loading the page (or a save that
  // just completed) never re-triggers itself.
  const baselineRef = useRef(null);
  const saveTimerRef = useRef(null);
  useEffect(() => {
    if (!profile) return;
    const next = {
      name: profile.name || '',
      unit: profile.unit || 'metric',
      age: profile.age || 30,
      weight: profile.weight || 70,
      height: profile.height || 170,
    };
    setForm(next);
    baselineRef.current = next;
  }, [profile]);

  // Name/unit/age/weight/height all autosave now — no Save button. Debounced
  // (so typing a two-digit age doesn't fire a save per keystroke), flushed
  // immediately on blur (so tapping away from a field doesn't wait out the
  // debounce), and flushed once more on unmount (so navigating away right
  // after an edit, before the debounce has fired, doesn't lose it).
  async function flushSave(snapshot) {
    if (!profile || !baselineRef.current) return;
    if (JSON.stringify(snapshot) === JSON.stringify(baselineRef.current)) return;
    const fields = { name: snapshot.name, unit: snapshot.unit, age: Number(snapshot.age), weight: Number(snapshot.weight), height: Number(snapshot.height) };
    // Mid-typing (a cleared number field) — wait for a real value rather than
    // saving NaN, or — Number('') is 0, not NaN — silently saving a 0.
    const isRealNumber = (raw, n) => String(raw).trim() !== '' && Number.isFinite(n);
    if (!isRealNumber(snapshot.age, fields.age) || !isRealNumber(snapshot.weight, fields.weight) || !isRealNumber(snapshot.height, fields.height)) return;
    try {
      await saveProfile(fields);
      baselineRef.current = snapshot;
      setToast({ message: 'Saved' });
    } catch (err) {
      console.error('Failed to autosave profile:', err);
      setToast({ message: "Couldn't save — try again.", error: true });
    }
  }
  // Always points at a flush of the CURRENT form — read by the blur handler
  // and the unmount cleanup below, both of which need this render's values,
  // not whatever was captured when the component first mounted. Updated in
  // an effect (runs after render, every render) rather than during render
  // itself, since refs aren't meant to be written while rendering.
  // Single settings that save the moment they're tapped (no typing, so no debounce).
  async function saveField(fields) {
    try {
      await saveProfile(fields);
      setToast({ message: 'Saved' });
    } catch (err) {
      console.error('Failed to save profile:', err);
      setToast({ message: "Couldn't save — try again.", error: true });
    }
  }
  const flushNowRef = useRef(() => {});
  useEffect(() => {
    flushNowRef.current = () => {
      if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      flushSave(form);
    };
  });

  useEffect(() => {
    if (!profile || !baselineRef.current) return;
    if (JSON.stringify(form) === JSON.stringify(baselineRef.current)) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => flushSave(form), 700);
    return () => clearTimeout(saveTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, profile]);

  // Unmount-only flush — a pending edit from right before navigating away
  // (inside the debounce window, before it fired) still gets saved.
  useEffect(() => () => flushNowRef.current(), []);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const pending = !!user?.is_anonymous && !!user?.new_email;
  const email = pending ? user.new_email : user?.email;
  const initials = (form.name || 'A').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'A';

  return (
    <div style={{ display: 'flex', height: 'var(--app-h)', overflow: 'hidden', background: 'var(--bg-primary)', fontFamily: "'Plus Jakarta Sans', sans-serif", color: 'var(--text-primary)' }}>
      <AppNav active="profile" initials={initials} />
      <div className="app-content-pad" style={{ flex: 1, overflow: 'auto', minWidth: 0 }}>
        <PageHeader title="Profile" onBack={() => navigate('/settings')} backLabel="Back to Settings" />
        <div className="page-pad">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <Avatar name={form.name || 'A'} size={84} />
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 22, margin: '10px 0 0', overflowWrap: 'anywhere' }}>{form.name || 'Your name'}</h2>
            {email && <div style={{ fontSize: 14, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{email}</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', margin: '16px 0' }}>
            <span style={chip}>{pending ? 'Confirming email' : 'Member'}</span>
          </div>

          {/* Details + stats, side by side like the rest of the app */}
          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Your details</SectionLabel>
              <FieldRow label="Name">
                <TextInput value={form.name} onChange={v => set('name', v)} onBlur={() => flushNowRef.current()} width="180px" ariaLabel="Name" />
              </FieldRow>
              <FieldRow label="Units">
                <SegmentedControl options={UNIT_OPTIONS} value={form.unit} onChange={v => set('unit', v)} fill={false} />
              </FieldRow>
              {profile && 'sex' in profile && (
                <FieldRow label="Sex" hint="Used for your nutrient targets">
                  <SegmentedControl options={SEX_OPTIONS} value={profile.sex || 'unspecified'} onChange={v => saveField({ sex: v, ...(v !== 'female' && 'life_stage' in profile ? { life_stage: 'none' } : {}) })} fill={false} />
                </FieldRow>
              )}
              {profile?.sex === 'female' && 'life_stage' in profile && (
                <FieldRow label="Pregnant or breastfeeding?" hint="Raises targets like iron, folate and iodine">
                  <SegmentedControl options={LIFE_STAGE_OPTIONS} value={profile.life_stage || 'none'} onChange={v => saveField({ life_stage: v })} fill={false} />
                </FieldRow>
              )}
            </Card>

            <Card style={{ marginBottom: 0 }}>
              <SectionLabel>Body stats</SectionLabel>
              <FieldRow label="Age">
                <TextInput value={form.age} onChange={v => set('age', v)} onBlur={() => flushNowRef.current()} type="number" suffix="years" width="90px" ariaLabel="Age" />
              </FieldRow>
              <FieldRow label="Weight">
                <TextInput value={form.weight} onChange={v => set('weight', v)} onBlur={() => flushNowRef.current()} type="number" suffix={form.unit === 'imperial' ? 'lb' : 'kg'} width="90px" ariaLabel="Weight" />
              </FieldRow>
              <FieldRow label="Height">
                <TextInput value={form.height} onChange={v => set('height', v)} onBlur={() => flushNowRef.current()} type="number" suffix={form.unit === 'imperial' ? 'in' : 'cm'} width="90px" ariaLabel="Height" />
              </FieldRow>
            </Card>
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} error={toast.error} onDone={() => setToast(null)} />}
    </div>
  );
}
