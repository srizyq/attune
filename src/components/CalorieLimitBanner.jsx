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
    <div role="status" style={{ background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', borderRadius: 14, padding: '10px 12px 10px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, ...style }}>
      <i className="ti ti-target-arrow" aria-hidden="true" style={{ color: 'var(--accent)', fontSize: 20, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{limit.calories.toLocaleString()} kcal limit</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>until {fmt(limit.end)} · {left} day{left === 1 ? '' : 's'} left</div>
      </div>
      <button onClick={() => navigate('/settings/goals')} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: '8px 4px', minHeight: 36, fontFamily: 'inherit' }}>
        Manage
      </button>
    </div>
  );
}
