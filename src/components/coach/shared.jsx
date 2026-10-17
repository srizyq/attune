import { useState } from 'react';
import { ACCENT } from './constants';
import SegmentedControl from '../SegmentedControl';
import Card from '../Card';

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
  const pill = { display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', borderRadius: 99, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: "'Plus Jakarta Sans', sans-serif", maxWidth: '100%' };
  return (
    <>
      {editingGroup ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
          <input
            value={groupInput}
            onChange={e => setGroupInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveGroup(); if (e.key === 'Escape') setEditingGroup(false); }}
            autoFocus
            placeholder="Group name"
            aria-label="Group name"
            style={{ width: 150, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 14px', fontSize: 16, background: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 99, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={saveGroup} aria-label="Save group" className="btn-press" style={{ ...pill, width: 44, padding: 0, justifyContent: 'center', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 16 }}>
            <i className="ti ti-check" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setGroupInput(row.group_label || ''); setEditingGroup(true); }}
          className="btn-press"
          title="Set group"
          aria-label="Set group"
          style={{ ...pill, background: 'var(--chip-bg)', color: 'var(--text-secondary)' }}
        >
          <i className="ti ti-tag" aria-hidden="true" style={{ fontSize: 15 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.group_label || 'Add to group'}</span>
        </button>
      )}
      <button
        onClick={() => { if (window.confirm(`Disconnect ${row.client?.name || 'this client'}? You'll lose access to their data immediately.`)) onRevoke(row.id); }}
        title="Disconnect"
        aria-label="Disconnect client"
        className="btn-press"
        style={{ ...pill, background: 'transparent', color: 'var(--danger)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--danger) 35%, transparent)' }}
      >
        <i className="ti ti-user-minus" aria-hidden="true" style={{ fontSize: 15 }} /> Disconnect
      </button>
    </>
  );
}

// Card moved to a top-level shared component (used app-wide, not just
// Coach) — re-exported here so existing imports keep working.
export { Card };

// The header row of a card: a caps label on the left and, optionally, one
// action on the right (CardAction). Centre-aligned with a 44px minimum so the
// action is a proper tap target and never sits on the label's baseline.
export function CardHeader({ icon, children, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, marginBottom: 8 }}>
      <SectionLabel icon={icon} style={{ margin: 0 }}>{children}</SectionLabel>
      {action}
    </div>
  );
}

// A small pill button for a card header ("Edit", "Copy summary").
export function CardAction({ onClick, icon, children }) {
  return (
    <button
      type="button" onClick={onClick} className="btn-press"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 14px', margin: '0 -6px 0 0', border: 'none', borderRadius: 99, background: 'transparent', color: 'var(--accent-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif", whiteSpace: 'nowrap' }}
    >
      {icon && <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 14 }} />}
      {children}
    </button>
  );
}

export function SectionLabel({ icon, children, style }) {
  return (
    <p style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-muted)', fontSize: '12px', letterSpacing: '0.08em', textTransform: 'uppercase', margin: '0 0 18px', ...style }}>
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
        fontSize: size * 0.32, fontWeight: 700, color: 'var(--accent)', fontFamily: "'Plus Jakarta Sans', sans-serif",
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
    <Card style={{ borderRadius: 12, padding: 16, marginBottom: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 22, fontWeight: 700, color: value === '—' ? 'var(--text-hint)' : color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{hint}</div>
    </Card>
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
// Thin wrapper around SegmentedControl — kept as its own component (rather
// than inlining SegmentedControl at each call site) so OverviewTab and
// ProgressTab don't need to change at all.
export function RangeToggle({ value, onChange, options }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      options={options}
      fill
      style={{ maxWidth: 320 }}
    />
  );
}
