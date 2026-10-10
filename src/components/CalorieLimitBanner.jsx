import { useNavigate } from 'react-router-dom';
import { daysLeft } from '../lib/calorieLimit';

const fmt = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

// A reminder, while a temporary limit is in effect, that today's numbers are
// not the usual ones — and a way to the settings card to change or end it.
export default function CalorieLimitBanner({ limit, today, style }) {
  const navigate = useNavigate();
  if (!limit) return null;
  const left = daysLeft(limit, today);
  return (
    <div role="status" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', boxShadow: 'var(--card-shadow)', borderRadius: 'var(--card-radius)', padding: '12px 12px 12px 12px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, ...style }}>
      <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--chip-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className="ti ti-target" style={{ color: 'var(--text-primary)', fontSize: 20 }} />
      </span>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{limit.calories.toLocaleString()} kcal limit</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>until {fmt(limit.end)} · {left} day{left === 1 ? '' : 's'} left</div>
      </div>
      <button onClick={() => navigate('/settings/goals')} style={{ flexShrink: 0, background: 'var(--chip-bg)', border: 'none', borderRadius: 20, color: 'var(--text-primary)', fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', padding: '9px 14px', minHeight: 36, fontFamily: 'inherit' }}>
        Manage
      </button>
    </div>
  );
}
