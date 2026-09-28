import { useState } from 'react';
import { ACCENT } from './constants';

// The group-tag + disconnect controls for a client — previously lived at
// the end of every client-list row; now lives in ClientDetail's header
// instead, since the row itself became a single tap target into this view.
export function RowActions({ row, onSetGroup, onRevoke }) {
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupInput, setGroupInput] = useState(row.group_label || '');
  const saveGroup = async () => {
    setEditingGroup(false);
    await onSetGroup(row.id, groupInput.trim());
  };
  return (
    <>
      {editingGroup ? (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
          <input
            value={groupInput}
            onChange={e => setGroupInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setEditingGroup(false); }}
            autoFocus
            placeholder="Group"
            aria-label="Group name"
            style={{ width: 90, padding: '4px 8px', fontSize: 11, background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 6, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={saveGroup} aria-label="Save group" className="btn-press" style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 13, padding: 2 }}>
            <i className="ti ti-check" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setGroupInput(row.group_label || ''); setEditingGroup(true); }}
          className="btn-press"
          title="Set group"
          aria-label="Set group"
          style={{
            background: row.group_label ? 'var(--bg-primary)' : 'none',
            border: row.group_label ? '1px solid var(--border-default)' : 'none',
            borderRadius: 20, padding: row.group_label ? '3px 10px' : 4,
            color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', flexShrink: 0, fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {row.group_label || <i className="ti ti-tag" />}
        </button>
      )}
      <button
        onClick={() => { if (window.confirm(`Disconnect ${row.client?.name || 'this client'}? You'll lose access to their data immediately.`)) onRevoke(row.id); }}
        title="Disconnect"
        aria-label="Disconnect client"
        className="btn-press"
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}
      >
        <i className="ti ti-x" />
      </button>
    </>
  );
}

export function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--card-border)',
      boxShadow: 'var(--card-shadow)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '16px',
      ...style,
    }}>
      {children}
    </div>
  );
}

export function SectionLabel({ icon, children }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 18px' }}>
      {icon && <i className={`ti ${icon}`} style={{ fontSize: 13 }} />}
      {children}
    </p>
  );
}

// Initials avatar with a progress ring around it — filled toward how much
// of the client's calorie target they've logged today. No target yet ==
// a plain unfilled ring, not a missing/broken-looking element.
export function ClientAvatar({ name, pct, size = 44 }) {
  const initials = (name || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const strokeWidth = 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, pct || 0));
  const offset = circumference * (1 - clamped);
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-default)" strokeWidth={strokeWidth} />
        {clamped > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--accent)" strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 500ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: strokeWidth, borderRadius: '50%', background: 'var(--bg-card)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.32, fontWeight: 700, color: 'var(--accent)', fontFamily: "'Syne', sans-serif",
      }}>
        {initials}
      </div>
    </div>
  );
}

export function StatRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-default)' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

export function StatCard({ label, value, hint, color = ACCENT }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 700, color: value === '—' ? 'var(--text-hint)' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{hint}</div>
    </div>
  );
}

export function EmptyChartBox({ icon, message }) {
  return (
    <div style={{ height: 180, border: '1px dashed var(--border-strong)', borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <i className={`ti ${icon}`} style={{ fontSize: 28, color: 'var(--text-hint)' }} />
      <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 200 }}>{message}</div>
    </div>
  );
}

// 7 / 30 / 90 day picker used across the client tabs.
export function RangeToggle({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 8 }} role="group" aria-label="Date range">
      {options.map(r => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          aria-pressed={value === r.id}
          className="btn-press"
          style={{
            background: value === r.id ? 'var(--accent-bg)' : 'var(--bg-card)',
            border: `1px solid ${value === r.id ? 'var(--accent-dark)' : 'var(--border-strong)'}`,
            borderRadius: 8, padding: '7px 18px', fontSize: 13,
            color: value === r.id ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
