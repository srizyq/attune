import { useCallback, useEffect, useRef, useState } from 'react';
import ModalPortal from './ModalPortal';
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


const NONE = '__none';

// Dragging a food onto another slot (or Uncategorised). Each food row has a
// handle; holding it picks the row up, the slot under the finger lights up, and
// letting go moves the food there. Near the top or bottom of the screen the page
// scrolls. The Move and Select tools do the same without dragging.
function useDragToSlot(onMove) {
  const [drag, setDrag] = useState(null); // { id, name, x, y, over }
  const stop = useRef(null);
  useEffect(() => () => stop.current?.(), []);

  const start = useCallback((e, item) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    const from = item.slotId || NONE;
    const scroller = e.currentTarget.closest('.app-content-pad');
    const live = { over: null, y: e.clientY };
    setDrag({ id: item.id, name: item.name, x: e.clientX, y: e.clientY, over: null });
    let raf = 0;
    const tick = () => {
      if (scroller) {
        const edge = 70;
        if (live.y < edge + 60) scroller.scrollTop -= 12;
        else if (live.y > window.innerHeight - edge - 60) scroller.scrollTop += 12;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = (ev) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-drop-slot]');
      live.over = el ? el.getAttribute('data-drop-slot') : null;
      live.y = ev.clientY;
      setDrag((d) => d && { ...d, x: ev.clientX, y: ev.clientY, over: live.over });
    };
    const end = (ev) => {
      cleanup();
      if (ev.type === 'pointerup' && live.over && live.over !== from) onMove([item.id], live.over === NONE ? null : live.over);
    };
    const cleanup = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      setDrag(null);
      stop.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    stop.current = cleanup;
  }, [onMove]);

  return { drag, start };
}

function DragChip({ drag }) {
  if (!drag) return null;
  return (
    <ModalPortal>
      <div aria-hidden="true" style={{ position: 'fixed', left: drag.x, top: drag.y, transform: 'translate(-50%, -130%)', zIndex: 600, pointerEvents: 'none', maxWidth: 240, padding: '8px 14px', borderRadius: 99, background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 13, fontWeight: 700, boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {drag.name}
      </div>
    </ModalPortal>
  );
}

// One food in a slot: a drag handle beside the usual row, or — while selecting —
// a checkbox row instead.
function ItemLine({ item, ctx, expandedItemId, onToggleItem, onDelete, onSave }) {
  if (ctx.selecting) {
    const checked = ctx.selected.has(item.id);
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 52, padding: '8px 14px', cursor: 'pointer', borderBottom: '1px solid var(--border-default)', background: checked ? 'var(--accent-bg)' : 'transparent' }}>
        <input type="checkbox" checked={checked} onChange={() => ctx.toggle(item.id)} aria-label={`Select ${item.name}`} style={{ width: 24, height: 24, minWidth: 24, flexShrink: 0, accentColor: 'var(--accent)' }} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{item.name}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(item.cal)} cal</span>
      </label>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', opacity: ctx.dragId === item.id ? 0.45 : 1 }}>
      <button
        type="button" aria-label={`Drag ${item.name} to another slot`} title="Drag to another slot"
        onPointerDown={(e) => ctx.startDrag(e, item)}
        style={{ width: 30, flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-hint)', cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, padding: 0 }}
      >
        <i className="ti ti-grip-vertical" aria-hidden="true" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <LogItemRow
          item={item}
          isExpanded={expandedItemId === item.id}
          onToggle={() => onToggleItem(item.id)}
          onDelete={() => onDelete(item.id)}
          onSave={async (fields) => { await onSave(item.id, fields); onToggleItem(item.id); }}
          slots={ctx.slots}
          isPremium
        />
      </div>
    </div>
  );
}

// Pick a slot (or Uncategorised) for the ticked foods.
function MoveToSlotSheet({ slots, count, onPick, onClose }) {
  return (
    <ModalPortal>
      <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Move to slot" className="modal-panel" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto', paddingBottom: 'calc(20px + var(--safe-bottom, 0px))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>Move {count} {count === 1 ? 'food' : 'foods'} to…</div>
            <button type="button" onClick={onClose} aria-label="Close" className="hit-slop" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>
          {[...slots.map((sl) => ({ id: sl.id, label: sl.label, sub: formatSlotTime(sl.slotTime) })), { id: null, label: 'Uncategorised', sub: 'No slot' }].map((o) => (
            <button key={o.id ?? 'none'} type="button" onClick={() => onPick(o.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 48, padding: '10px 14px', marginBottom: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, color: 'var(--text-primary)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{o.label}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{o.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </ModalPortal>
  );
}

// Name and time for a slot made from the ticked foods.
function GroupSheet({ count, onCreate, onClose }) {
  const [label, setLabel] = useState('');
  const [time, setTime] = useState('12:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(e) {
    e.preventDefault();
    if (!label.trim() || busy) return;
    setBusy(true);
    setError(null);
    try { await onCreate({ label: label.trim(), slotTime: time }); } catch (err) { console.error('Failed to create slot:', err); setError('Couldn\'t create that slot. Try again.'); setBusy(false); }
  }
  return (
    <ModalPortal>
      <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 500 }}>
        <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Group into new slot" className="modal-panel" style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, paddingBottom: 'calc(20px + var(--safe-bottom, 0px))' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>New slot for {count} {count === 1 ? 'food' : 'foods'}</div>
          <label htmlFor="group-name" style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 2px 5px' }}>Slot name</label>
          <input id="group-name" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Pre-workout" style={{ ...targetInputStyle, fontSize: 15, padding: '12px 14px', marginBottom: 12 }} />
          <label htmlFor="group-time" style={{ display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 2px 5px' }}>Time</label>
          <input id="group-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...targetInputStyle, fontSize: 15, padding: '12px 14px', marginBottom: 14 }} />
          {error && <div role="alert" style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 10 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, minHeight: 46, background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 14, color: 'var(--text-secondary)', fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={!label.trim() || busy} style={{ flex: 2, minHeight: 46, background: 'var(--accent)', border: 'none', borderRadius: 14, color: 'var(--accent-contrast)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: !label.trim() || busy ? 0.55 : 1 }}>{busy ? 'Creating…' : 'Create slot'}</button>
          </div>
        </form>
      </div>
    </ModalPortal>
  );
}

// The tools bar while selecting: how many are ticked, and what to do with them.
function SelectBar({ count, onMove, onGroup, onCancel }) {
  const btn = (primary) => ({ flex: 1, minHeight: 44, borderRadius: 14, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: primary ? 'none' : '1px solid var(--border-default)', background: primary ? 'var(--accent)' : 'var(--bg-card)', color: primary ? 'var(--accent-contrast)' : 'var(--text-secondary)', opacity: count === 0 && primary ? 0.55 : 1 });
  return (
    <ModalPortal>
      <div role="toolbar" aria-label="Selected foods" style={{ position: 'fixed', left: 12, right: 12, bottom: 'calc(var(--bottom-nav-h, 0px) + 12px)', margin: '0 auto', maxWidth: 520, zIndex: 150, display: 'flex', alignItems: 'center', gap: 8, padding: 10, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 18, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', padding: '0 6px', whiteSpace: 'nowrap' }}>{count} selected</span>
        <button type="button" onClick={onMove} disabled={count === 0} style={btn(false)}>Move to slot</button>
        <button type="button" onClick={onGroup} disabled={count === 0} style={btn(true)}>New slot</button>
        <button type="button" onClick={onCancel} aria-label="Cancel selecting" style={{ ...btn(false), flex: '0 0 44px', padding: 0 }}>✕</button>
      </div>
    </ModalPortal>
  );
}

// Pro's custom-named slot timeline (daily_log_view === 'slots') — a
// dot-and-line vertical list of the day's day_slots (see src/lib/daySlots.js),
// each showing its own kcal/macro totals and logged items in an expandable
// card. A slot with nothing logged in it yet shows its stored macro targets
// ("balance") and a prompt to log against it instead of an item list.
export default function SlotTimeline({ segments, onDelete, onSave, onNavigateAdd, onAddSlot, onEditSlot, onDeleteSlot, onMoveToSlot, onGroupIntoSlot, emptyMessage = 'Nothing set up for this day yet.' }) {
  const [openSlots, setOpenSlots] = useState({});
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [addingSlot, setAddingSlot] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [sheet, setSheet] = useState(null); // 'move' | 'group'

  const hasSlots = segments.some((s) => s.type === 'slot');
  const slots = segments.filter((s) => s.type === 'slot');
  const foodCount = segments.reduce((n, s) => n + s.items.length, 0);

  const moveFoods = useCallback(async (ids, slotId) => {
    try { await onMoveToSlot?.(ids, slotId); } catch (err) { console.error('Failed to move foods:', err); }
  }, [onMoveToSlot]);
  const { drag, start: startDrag } = useDragToSlot(moveFoods);

  const toggle = (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const leaveSelecting = () => { setSelecting(false); setSelected(new Set()); setSheet(null); };
  const ctx = { selecting, selected, toggle, startDrag, dragId: drag?.id ?? null, slots };

  return (
    <div>
      {!hasSlots && (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-hint)', fontSize: 13, background: 'var(--bg-subtle)', border: '1px dashed var(--border-strong)', borderRadius: 10, marginBottom: 14 }}>
          {emptyMessage}
        </div>
      )}

      {foodCount > 0 && onMoveToSlot && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button type="button" onClick={() => (selecting ? leaveSelecting() : setSelecting(true))} aria-pressed={selecting} style={{ minHeight: 44, padding: '0 14px', background: 'none', border: 'none', color: 'var(--accent)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            {selecting ? 'Done' : 'Select foods'}
          </button>
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
              isOpen={selecting || !!openSlots[seg.id]}
              onToggle={() => setOpenSlots((o) => ({ ...o, [seg.id]: !o[seg.id] }))}
              expandedItemId={expandedItemId}
              onToggleItem={(id) => setExpandedItemId((prev) => (prev === id ? null : id))}
              onDelete={onDelete}
              onSave={onSave}
              ctx={ctx}
              dropActive={drag?.over === seg.id}
              onNavigateAdd={onNavigateAdd}
              onEditSlot={onEditSlot}
              onDeleteSlot={onDeleteSlot}
            />
          ) : (
            <UnsortedEntry
              key={seg.id}
              segment={seg}
              isLast={isLast}
              isOpen={selecting || !!openSlots[seg.id]}
              onToggle={() => setOpenSlots((o) => ({ ...o, [seg.id]: !o[seg.id] }))}
              expandedItemId={expandedItemId}
              onToggleItem={(id) => setExpandedItemId((prev) => (prev === id ? null : id))}
              onDelete={onDelete}
              onSave={onSave}
              ctx={ctx}
              dropActive={drag?.over === NONE}
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

      <DragChip drag={drag} />
      {selecting && <SelectBar count={selected.size} onMove={() => setSheet('move')} onGroup={() => setSheet('group')} onCancel={leaveSelecting} />}
      {sheet === 'move' && (
        <MoveToSlotSheet
          slots={slots} count={selected.size} onClose={() => setSheet(null)}
          onPick={async (slotId) => { await moveFoods([...selected], slotId); leaveSelecting(); }}
        />
      )}
      {sheet === 'group' && (
        <GroupSheet
          count={selected.size} onClose={() => setSheet(null)}
          onCreate={async (fields) => { await onGroupIntoSlot([...selected], fields); leaveSelecting(); }}
        />
      )}
    </div>
  );
}

function SlotEntry({ segment, isLast, isOpen, onToggle, expandedItemId, onToggleItem, onDelete, onSave, ctx, dropActive, onNavigateAdd, onEditSlot, onDeleteSlot }) {
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
      <div data-drop-slot={id} style={{ flex: 1, minWidth: 0, background: 'var(--bg-subtle)', border: dropActive ? '2px solid var(--accent)' : '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
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
                <button onClick={() => setRenaming(true)} title="Rename slot" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', minWidth: 0, minHeight: 32, display: 'flex', alignItems: 'center' }}>
                  <MarqueeText text={label} style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }} />
                </button>
              )}
            </div>
            <button onClick={onToggle} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minHeight: 32, display: 'flex', alignItems: 'center' }}>
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
              <button onClick={() => setEditingTarget(true)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 0', minHeight: 32, cursor: 'pointer', marginBottom: 4 }}>
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
              <ItemLine key={item.id} item={item} ctx={ctx} expandedItemId={expandedItemId} onToggleItem={onToggleItem} onDelete={onDelete} onSave={onSave} />
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

function UnsortedEntry({ segment, isLast, isOpen, onToggle, expandedItemId, onToggleItem, onDelete, onSave, ctx, dropActive }) {
  const { items } = segment;
  const t = totals(items);
  return (
    <div style={{ display: 'flex', gap: 10, paddingBottom: 14 }}>
      <TimeDot isLast={isLast} />
      <div data-drop-slot={NONE} style={{ flex: 1, minWidth: 0, background: 'var(--bg-subtle)', border: dropActive ? '2px solid var(--accent)' : '1px dashed var(--border-default)', borderRadius: 10, overflow: 'hidden' }}>
        <button onClick={onToggle} style={{ width: '100%', background: 'none', border: 'none', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left' }}>
          <span style={{ color: 'var(--text-hint)', fontSize: 12 }}>Uncategorised · {t.cal} kcal</span>
          <span style={{ color: 'var(--text-hint)', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
        </button>
        {isOpen && (
          <div style={{ borderTop: '1px solid var(--border-default)' }}>
            {items.map((item) => (
              <ItemLine key={item.id} item={item} ctx={ctx} expandedItemId={expandedItemId} onToggleItem={onToggleItem} onDelete={onDelete} onSave={onSave} />
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
