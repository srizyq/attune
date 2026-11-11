import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModalPortal from './ModalPortal';
import { round1 } from '../lib/format';
import SeeDetails from './FoodDetails';
import ListRow from './ListRow';
import SwipeToDelete from './SwipeToDelete';

const C = {
  green: 'var(--accent)', protein: 'var(--macro-protein)', blue: 'var(--macro-carbs)', purple: 'var(--macro-fat)',
};
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' };

// Plain text macro readout — matches the style used everywhere else in the
// app (e.g. FoodCard's add-food preview) instead of a bordered box.
function MacroReadout({ value, unit, label, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{value}{unit}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

// A logged food row. Tapping your own entry opens the edit page
// (/log/item/:id); the swipe-to-delete stays on the row. readOnly rows (a
// coach reading a client's diary, a friend's day) only look — they open a
// read-only detail sheet instead, since the page loads *your* log.
export default function LogItemRow({ item, onDelete, readOnly = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const openItem = () => {
    if (readOnly) setOpen(true);
    else navigate(`/log/item/${item.id}${item.loggedDate ? `?date=${item.loggedDate}` : ''}`);
  };

  return (
    <>
      <SwipeToDelete onDelete={onDelete} disabled={readOnly || !onDelete}>
        {/* Every meal card around this row indents its own content ~16-18px; the
            bare ListRow sat against the card's left border instead. */}
        <div style={{ padding: '0 16px' }}>
          <ListRow
            avatar={<ListRow.SquareAvatar icon="ti-tools-kitchen-2" />}
            title={item.name}
            subtitleParts={[item.brand, `${Math.round(item.cal)} cal`, `P ${round1(item.protein)}g`, `C ${round1(item.carbs)}g`, `F ${round1(item.fat)}g`, item.ingredients ? `${item.ingredients.length} ingredient${item.ingredients.length === 1 ? '' : 's'}` : null]}
            trailing={<ListRow.Chevron />}
            onClick={openItem}
          />
        </div>
      </SwipeToDelete>
      {open && (
        <ModalPortal>
        <div onClick={() => setOpen(false)} className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={item.name}
            className="modal-panel"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: '16px 16px 0 0', padding: 20, width: '100%', maxWidth: 480, maxHeight: '88vh', overflowY: 'auto', paddingBottom: 'calc(20px + var(--safe-bottom, 0px))' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                {item.brand && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.brand}</div>}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="hit-slop" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, flexShrink: 0 }}><span className="x-mark" aria-hidden="true" /></button>
            </div>

            {item.ingredients && (
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Ingredients (as scanned)</label>
                <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: '0 12px', background: 'var(--bg-primary)' }}>
                  {item.ingredients.map((ing, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: i < item.ingredients.length - 1 ? '1px solid var(--border-default)' : 'none' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', minWidth: 0, overflowWrap: 'anywhere' }}>{ing.name}{ing.grams ? <span style={{ color: 'var(--text-muted)' }}> · {Math.round(ing.grams)}g</span> : null}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{Math.round(ing.cal || 0)} cal</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

              <>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <MacroReadout value={Math.round(item.cal)} unit="" label="Calories" color={C.green} />
                <MacroReadout value={round1(item.protein)} unit="g" label="Protein" color={C.protein} />
                <MacroReadout value={round1(item.carbs)} unit="g" label="Carbs" color={C.blue} />
                <MacroReadout value={round1(item.fat)} unit="g" label="Fat" color={C.purple} />
              </div>
              <SeeDetails food={item} style={{ marginTop: 10, padding: 0 }} />
              </>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
