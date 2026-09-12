import { useState } from 'react';
import { formatHourLabel } from '../lib/mealTime';
import { round1 } from '../lib/format';
import LogItemRow from './LogItemRow';
import MarqueeText from './MarqueeText';

function AddHourButton({ hour, label, onNavigateAdd }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onNavigateAdd(hour); }}
      title={`Add food at ${label}`}
      style={{
        width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
        background: 'var(--accent)', border: 'none', color: '#0f0f0f',
        fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <i className="ti ti-plus" />
    </button>
  );
}

// Pro users' hourly daily log, covering the full 12am–11pm day instead
// of only showing hours that have something logged in them (which read
// as basically empty for most of the day). Segments come from
// buildDayTimeline (lib/mealTime.js): real hours render as expandable
// cards identical in shape to the free-tier meal cards; empty stretches
// collapse into a single row that expands into individual empty-hour
// markers on tap, and collapses back on a second tap. Every visible hour
// — logged or empty, collapsed-open or not — carries its own "+" so you
// can jump straight to logging at that exact hour without expanding
// anything first.
export default function HourlyTimeline({ segments, onDelete, onSave, onNavigateAdd, emptyMessage = 'Nothing logged today yet.' }) {
  const [openHours, setOpenHours] = useState({});
  const [openGaps, setOpenGaps] = useState({});
  const [expandedItemId, setExpandedItemId] = useState(null);

  // buildDayTimeline never returns an empty array — a day with nothing
  // logged is still one giant gap segment spanning all 24 hours. Render
  // the plain empty state instead of a single "12am – 12am" gap row,
  // which would be a confusing zero-width-looking range for what's
  // actually the entire day.
  const hasAnyLogged = segments.some(s => s.type === 'hour');
  if (!hasAnyLogged) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-hint)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {segments.map(seg => (
        seg.type === 'hour' ? (
          <HourCard
            key={seg.hour}
            segment={seg}
            isOpen={!!openHours[seg.hour]}
            onToggle={() => setOpenHours(o => ({ ...o, [seg.hour]: !o[seg.hour] }))}
            expandedItemId={expandedItemId}
            onToggleItem={(id) => setExpandedItemId(prev => (prev === id ? null : id))}
            onDelete={onDelete}
            onSave={onSave}
            onNavigateAdd={onNavigateAdd}
          />
        ) : (
          <GapRow
            key={seg.id}
            segment={seg}
            isOpen={!!openGaps[seg.id]}
            onToggle={() => setOpenGaps(o => ({ ...o, [seg.id]: !o[seg.id] }))}
            onNavigateAdd={onNavigateAdd}
          />
        )
      ))}
    </div>
  );
}

function HourCard({ segment, isOpen, onToggle, expandedItemId, onToggleItem, onDelete, onSave, onNavigateAdd }) {
  const { hour, label, items } = segment;
  const total = Math.round(items.reduce((s, i) => s + i.cal, 0));
  const protein = round1(items.reduce((s, i) => s + (i.protein || 0), 0));
  const carbs = round1(items.reduce((s, i) => s + (i.carbs || 0), 0));
  const fat = round1(items.reduce((s, i) => s + (i.fat || 0), 0));
  const preview = items.length === 1 ? items[0].name : `${items.length} items`;

  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 10px 9px 12px' }}>
        <button
          onClick={onToggle}
          style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)',
              background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 99,
              padding: '4px 10px', flexShrink: 0,
            }}>
              {label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <MarqueeText text={preview} style={{ color: 'var(--text-muted)', fontSize: 12 }} />
            </div>
          </div>
          <div style={{ paddingLeft: 2, color: 'var(--text-hint)', fontSize: 11 }}>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{total} kcal</span> · P {protein}g · C {carbs}g · F {fat}g
          </div>
        </button>
        <AddHourButton hour={hour} label={label} onNavigateAdd={onNavigateAdd} />
      </div>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border-default)' }}>
          {items.map(item => (
            <LogItemRow
              key={item.id}
              item={item}
              isExpanded={expandedItemId === item.id}
              onToggle={() => onToggleItem(item.id)}
              onDelete={() => onDelete(item.id)}
              onSave={async (fields) => { await onSave(item.id, fields); onToggleItem(item.id); }}
              isPremium
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GapRow({ segment, isOpen, onToggle, onNavigateAdd }) {
  return (
    <div style={{ background: 'var(--bg-subtle)', border: '1px dashed var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', background: 'none', border: 'none', padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>Nothing logged · {segment.label}</span>
        <span style={{ color: 'var(--text-hint)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {isOpen && (
        <div style={{ borderTop: '1px solid var(--border-default)', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {segment.hours.map(h => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 2px' }}>
              <span style={{
                fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--text-hint)',
                background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 99,
                padding: '4px 10px',
              }}>
                {formatHourLabel(h)}
              </span>
              <span style={{ flex: 1, color: 'var(--text-hint)', fontSize: 12 }}>Nothing logged</span>
              <AddHourButton hour={h} label={formatHourLabel(h)} onNavigateAdd={onNavigateAdd} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
