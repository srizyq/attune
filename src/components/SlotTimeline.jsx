import { useState } from 'react';
import { formatSlotTime } from '../lib/daySlots';
import { round1 } from '../lib/format';
import LogItemRow from './LogItemRow';
import MarqueeText from './MarqueeText';

function totals(items) {
  return {
    cal: Math.round(items.reduce((s, i) => s + i.cal, 0)),
    protein: round1(items.reduce((s, i) => s + (i.protein || 0), 0)),
    carbs: round1(items.reduce((s, i) => s + (i.carbs || 0), 0)),
    fat: round1(items.reduce((s, i) => s + (i.fat || 0), 0)),
  };
}

// Only the macros a slot actually has a stored target for — a slot with no
// targets set at all renders no balance line rather than a row of zeroes
// that would read as "aim for nothing".
function targetParts(segment) {
  const parts = [];
  if (segment.targetProtein != null) parts.push(`P ${round1(segment.targetProtein)}g`);
  if (segment.targetCarbs != null) parts.push(`C ${round1(segment.targetCarbs)}g`);
  if (segment.targetFat != null) parts.push(`F ${round1(segment.targetFat)}g`);
  return parts;
}

function TimeDot({ isLast }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
      {!isLast && <div style={{ flex: 1, width: 2, background: 'var(--border-default)', marginTop: 2 }} />}
    </div>
  );
}

// Pro's custom-named slot timeline (daily_log_view === 'slots') — a
// dot-and-line vertical list of the day's day_slots (see src/lib/daySlots.js),
// each showing its own kcal/macro totals and logged items in an expandable
// card. A slot with nothing logged in it yet shows its stored macro targets
// ("balance") and a prompt to log against it instead of an item list.
export default function SlotTimeline({ segments, onDelete, onSave, onNavigateAdd, onAddSlot, onEditSlot, onDeleteSlot, emptyMessage = 'Nothing set up for this day yet.' }) {
  const [openSlots, setOpenSlots] = useState({});
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [addingSlot, setAddingSlot] = useState(false);

  const hasSlots = segments.some((s) => s.type === 'slot');

  return (
    <div>
      {!hasSlots && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-hint)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10, marginBottom: 14 }}>
          {emptyMessage}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          return seg.type === 'slot' ? (
            <SlotEntry
              key={seg.id}
              segment={seg}
              isLast={isLast}
              isOpen={!!openSlots[seg.id]}
              onToggle={() => setOpenSlots((o) => ({ ...o, [seg.id]: !o[seg.id] }))}
              expandedItemId={expandedItemId}
              onToggleItem={(id) => setExpandedItemId((prev) => (prev === id ? null : id))}
              onDelete={onDelete}
              onSave={onSave}
              onNavigateAdd={onNavigateAdd}
              onEditSlot={onEditSlot}
              onDeleteSlot={onDeleteSlot}
            />
          ) : (
            <UnsortedEntry
              key={seg.id}
              segment={seg}
              isLast={isLast}
              isOpen={!!openSlots[seg.id]}
              onToggle={() => setOpenSlots((o) => ({ ...o, [seg.id]: !o[seg.id] }))}
              expandedItemId={expandedItemId}
              onToggleItem={(id) => setExpandedItemId((prev) => (prev === id ? null : id))}
              onDelete={onDelete}
              onSave={onSave}
            />
          );
        })}
      </div>

      {addingSlot ? (
        <AddSlotForm
          onCancel={() => setAddingSlot(false)}
          onSubmit={async (fields) => { await onAddSlot(fields); setAddingSlot(false); }}
        />
      ) : (
        <button
          onClick={() => setAddingSlot(true)}
          style={{ width: '100%', background: 'none', border: '1px dashed var(--border-strong)', borderRadius: 10, color: 'var(--accent-dark)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '12px', fontFamily: 'inherit', marginTop: hasSlots ? 8 : 0 }}
        >
          + Add slot
        </button>
      )}
    </div>
  );
}

function SlotEntry({ segment, isLast, isOpen, onToggle, expandedItemId, onToggleItem, onDelete, onSave, onNavigateAdd, onEditSlot, onDeleteSlot }) {
  const { id, label, slotTime, items } = segment;
  const t = totals(items);
  const balance = targetParts(segment);
  const [renaming, setRenaming] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const [retiming, setRetiming] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);

  async function commitLabel() {
    setRenaming(false);
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== label) await onEditSlot(id, { label: trimmed });
    else setLabelDraft(label);
  }

  return (
    <div style={{ display: 'flex', gap: 10, paddingBottom: 14 }}>
      <TimeDot isLast={isLast} />
      <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 10px 10px 12px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {retiming ? (
                <input
                  type="time"
                  autoFocus
                  defaultValue={slotTime}
                  onBlur={async (e) => { setRetiming(false); if (e.target.value && e.target.value !== slotTime) await onEditSlot(id, { slotTime: e.target.value }); }}
                  style={{ fontSize: 12, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 8, padding: '3px 8px', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              ) : (
                <button onClick={() => setRetiming(true)} title="Change time" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 99, padding: '4px 10px', cursor: 'pointer' }}>
                  {formatSlotTime(slotTime)}
                </button>
              )}
              {renaming ? (
                <input
                  autoFocus
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                  style={{ flex: 1, minWidth: 60, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '3px 8px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit' }}
                />
              ) : (
                <button onClick={() => setRenaming(true)} title="Rename slot" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', minWidth: 0 }}>
                  <MarqueeText text={label} style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }} />
                </button>
              )}
            </div>
            <button onClick={onToggle} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ paddingLeft: 2, color: 'var(--text-hint)', fontSize: 11 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{t.cal} kcal</span>
                {items.length > 0 && <> · P {t.protein}g · C {t.carbs}g · F {t.fat}g</>}
              </div>
            </button>
          </div>
          <button onClick={() => onNavigateAdd(segment)} title={`Add food to ${label}`} style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'var(--accent)', border: 'none', color: 'var(--accent-contrast)', fontSize: 14, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <i className="ti ti-plus" />
          </button>
          <button onClick={() => onDeleteSlot(id)} title={`Delete ${label}`} style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-hint)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <i className="ti ti-trash" />
          </button>
        </div>

        {items.length === 0 ? (
          <div style={{ borderTop: '1px solid var(--border-default)', padding: '10px 12px' }}>
            {editingTarget ? (
              <TargetEditor
                segment={segment}
                onCancel={() => setEditingTarget(false)}
                onSubmit={async (fields) => { await onEditSlot(id, fields); setEditingTarget(false); }}
              />
            ) : (
              <button onClick={() => setEditingTarget(true)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text-hint)', letterSpacing: '0.04em' }}>
                  {balance.length > 0 ? <>TARGET BALANCE: {balance.join(' · ')}</> : 'Set a target for this slot'}
                </span>
              </button>
            )}
            <button onClick={() => onNavigateAdd(segment)} style={{ width: '100%', background: 'var(--bg-card)', border: '1px dashed var(--border-strong)', borderRadius: 8, color: 'var(--accent-dark)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '9px', fontFamily: 'inherit' }}>
              + Log {label}
            </button>
          </div>
        ) : isOpen && (
          <div style={{ borderTop: '1px solid var(--border-default)' }}>
            {items.map((item) => (
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
            <button onClick={() => onNavigateAdd(segment)} style={{ width: '100%', background: 'none', border: 'none', borderTop: '1px solid var(--border-default)', color: 'var(--accent-dark)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '10px 12px', textAlign: 'left', fontFamily: 'inherit' }}>
              APPEND TO {label.toUpperCase()}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UnsortedEntry({ segment, isLast, isOpen, onToggle, expandedItemId, onToggleItem, onDelete, onSave }) {
  const { items } = segment;
  const t = totals(items);
  return (
    <div style={{ display: 'flex', gap: 10, paddingBottom: 14 }}>
      <TimeDot isLast={isLast} />
      <div style={{ flex: 1, minWidth: 0, background: 'var(--bg-subtle)', border: '1px dashed var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
        <button onClick={onToggle} style={{ width: '100%', background: 'none', border: 'none', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
          <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>Unsorted (no slot) · {t.cal} kcal</span>
          <span style={{ color: 'var(--text-hint)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>
        {isOpen && (
          <div style={{ borderTop: '1px solid var(--border-default)' }}>
            {items.map((item) => (
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
    </div>
  );
}

const targetInputStyle = { width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '7px 8px', fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box' };

// Shared by AddSlotForm (setting a target while creating a slot) and
// SlotEntry (editing an existing one's target later) — three optional
// number inputs, blank meaning "no target for this macro" rather than 0
// (see day_slots' target_*_g columns).
function TargetInputs({ protein, carbs, fat, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-hint)', display: 'block', marginBottom: 3 }}>Protein (g)</label>
        <input type="number" min="0" inputMode="decimal" value={protein} onChange={(e) => onChange('protein', e.target.value)} style={targetInputStyle} />
      </div>
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-hint)', display: 'block', marginBottom: 3 }}>Carbs (g)</label>
        <input type="number" min="0" inputMode="decimal" value={carbs} onChange={(e) => onChange('carbs', e.target.value)} style={targetInputStyle} />
      </div>
      <div>
        <label style={{ fontSize: 10, color: 'var(--text-hint)', display: 'block', marginBottom: 3 }}>Fat (g)</label>
        <input type="number" min="0" inputMode="decimal" value={fat} onChange={(e) => onChange('fat', e.target.value)} style={targetInputStyle} />
      </div>
    </div>
  );
}

function parseTarget(v) {
  const trimmed = String(v ?? '').trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function TargetEditor({ segment, onCancel, onSubmit }) {
  const [protein, setProtein] = useState(segment.targetProtein ?? '');
  const [carbs, setCarbs] = useState(segment.targetCarbs ?? '');
  const [fat, setFat] = useState(segment.targetFat ?? '');
  const [saving, setSaving] = useState(false);

  function onChange(field, value) {
    if (field === 'protein') setProtein(value);
    else if (field === 'carbs') setCarbs(value);
    else setFat(value);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSubmit({ targetProtein: parseTarget(protein), targetCarbs: parseTarget(carbs), targetFat: parseTarget(fat) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <TargetInputs protein={protein} carbs={carbs} fat={fat} onChange={onChange} />
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: 'none', border: '1px solid var(--border-default)', borderRadius: 6, padding: '6px', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button type="button" onClick={handleSave} disabled={saving} style={{ flex: 1, background: 'var(--accent)', border: 'none', borderRadius: 6, padding: '6px', color: 'var(--accent-contrast)', fontSize: 11, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>{saving ? 'Saving…' : 'Save target'}</button>
      </div>
    </div>
  );
}

function AddSlotForm({ onCancel, onSubmit }) {
  const [label, setLabel] = useState('');
  const [slotTime, setSlotTime] = useState('12:00');
  const [showTargets, setShowTargets] = useState(false);
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function onChange(field, value) {
    if (field === 'protein') setProtein(value);
    else if (field === 'carbs') setCarbs(value);
    else setFat(value);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!label.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        label: label.trim(),
        slotTime,
        targetProtein: parseTarget(protein),
        targetCarbs: parseTarget(carbs),
        targetFat: parseTarget(fat),
      });
    } catch {
      setError("Couldn't add that slot — try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Slot name (e.g. Morning Fuel)"
          style={{ flex: 1, minWidth: 0, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
        <input
          type="time"
          value={slotTime}
          onChange={(e) => setSlotTime(e.target.value)}
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit' }}
        />
      </div>
      {showTargets ? (
        <TargetInputs protein={protein} carbs={carbs} fat={fat} onChange={onChange} />
      ) : (
        <button type="button" onClick={() => setShowTargets(true)} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--accent-dark)', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
          + Set a target for this slot
        </button>
      )}
      {error && <p style={{ color: 'var(--danger)', fontSize: 12, margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel} style={{ flex: 1, background: 'none', border: '1px solid var(--border-default)', borderRadius: 7, padding: '9px', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button type="submit" disabled={!label.trim() || saving} style={{ flex: 1, background: !label.trim() || saving ? 'var(--border-default)' : 'var(--accent)', border: 'none', borderRadius: 7, padding: '9px', color: !label.trim() || saving ? 'var(--text-muted)' : 'var(--accent-contrast)', fontSize: 13, fontWeight: 600, cursor: !label.trim() || saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
          {saving ? 'Adding…' : 'Add slot'}
        </button>
      </div>
    </form>
  );
}
