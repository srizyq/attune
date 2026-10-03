import { useEffect, useState } from 'react';
import { tweakChipLabel, includesLine, cropRect } from '../lib/menuTweaks';

// The rows the menu-scan confirm step shows beyond the basic estimate:
// portion size, allergens, quick tweaks, and where on the photo the dish
// came from. Their data comes from useMenuPickDetail.

// ── Source pill ────────────────────────────────────────────────────────

export function SourcePill({ label, quote, onInspect }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
      <i className="ti ti-camera" aria-hidden="true" style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {quote && <> • <em>“{quote}”</em></>}
      </div>
      {onInspect && (
        <button onClick={onInspect} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '6px 0 6px 8px', minHeight: 32, fontFamily: 'inherit' }}>
          Inspect crop
        </button>
      )}
    </div>
  );
}

// ── Crop viewer ────────────────────────────────────────────────────────

/** The part of the menu photo the dish was read from, in an overlay. */
export function CropViewer({ photo, box, onClose }) {
  const [cropUrl, setCropUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      try {
        const r = cropRect(box);
        const sx = r.x * img.width; const sy = r.y * img.height;
        const sw = r.w * img.width; const sh = r.h * img.height;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(sw));
        canvas.height = Math.max(1, Math.round(sh));
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        if (!cancelled) setCropUrl(canvas.toDataURL('image/jpeg', 0.9));
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    img.onerror = () => { if (!cancelled) setFailed(true); };
    img.src = photo;
    return () => { cancelled = true; };
  }, [photo, box]);

  return (
    <div onClick={onClose} className="modal-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div role="dialog" aria-modal="true" aria-label="Where this dish was read on the menu" onClick={(e) => e.stopPropagation()} className="modal-panel" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)', borderRadius: 14, padding: 14, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Read from your photo</span>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '4px 6px' }}>✕</button>
        </div>
        {cropUrl && <img src={cropUrl} alt="The part of the menu photo this dish was read from" style={{ width: '100%', borderRadius: 8, display: 'block' }} />}
        {!cropUrl && !failed && <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>}
        {failed && <div style={{ padding: '16px 0', fontSize: 12, color: 'var(--text-muted)' }}>Couldn't cut out that part of the photo.</div>}
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          If this isn't the dish you picked, the numbers may be off — use the box below to tell it what you got.
        </p>
      </div>
    </div>
  );
}

// ── Portion + allergens ────────────────────────────────────────────────

export function PortionRow({ portions, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', marginBottom: 12 }}>
      <label htmlFor="menu-portion" style={{ fontSize: 13, color: 'var(--text-muted)' }}>Portion serving</label>
      <div style={{ position: 'relative', minWidth: 0, maxWidth: '65%' }}>
        <select
          id="menu-portion"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ appearance: 'none', WebkitAppearance: 'none', width: '100%', minHeight: 36, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 999, padding: '6px 32px 6px 14px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', textOverflow: 'ellipsis' }}
        >
          {portions.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
        </select>
        <i className="ti ti-chevron-down" aria-hidden="true" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--text-muted)', pointerEvents: 'none' }} />
      </div>
    </div>
  );
}

export function PortionSkeleton() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--border-default)', borderBottom: '1px solid var(--border-default)', marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>
      <span>Portion serving</span>
      <span style={{ fontSize: 12 }}>Loading…</span>
    </div>
  );
}

export function IncludesRow({ allergens, sodiumMg, fibre, sugar, sodium }) {
  const [open, setOpen] = useState(false);
  const line = includesLine(allergens, sodiumMg);
  const hasDetails = sodium != null || fibre != null || sugar != null;
  if (!line && !hasDetails) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        <span style={{ minWidth: 0 }}>{line || 'Nutrition details'}</span>
        {hasDetails && (
          <button onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', padding: '6px 0 6px 8px', minHeight: 32, display: 'flex', alignItems: 'center', gap: 2 }}>
            Details <i className={`ti ti-chevron-${open ? 'up' : 'right'}`} aria-hidden="true" style={{ fontSize: 12 }} />
          </button>
        )}
      </div>
      {open && hasDetails && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 8, marginTop: 6, borderTop: '1px solid var(--border-default)', fontSize: 12, color: 'var(--text-muted)' }}>
          {fibre != null && <span>Fibre <span style={{ color: 'var(--text-secondary)' }}>{fibre}g</span></span>}
          {sodium != null && <span>Sodium <span style={{ color: 'var(--text-secondary)' }}>{sodium}mg</span></span>}
          {sugar != null && <span>Sugar <span style={{ color: 'var(--text-secondary)' }}>{sugar}g</span></span>}
        </div>
      )}
    </div>
  );
}

// ── Quick tweaks ───────────────────────────────────────────────────────

export function QuickTweaks({ tweaks, active, onToggle }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
      <span style={{ flexShrink: 0, fontSize: 10, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Quick tweak:</span>
      <div role="group" aria-label="Quick tweaks" style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, minWidth: 0, padding: '2px 0', scrollbarWidth: 'none' }}>
        {tweaks.map((t, i) => {
          const on = active.has(i);
          return (
            <button
              key={i}
              onClick={() => onToggle(i)}
              aria-pressed={on}
              style={{
                flexShrink: 0, whiteSpace: 'nowrap', minHeight: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer',
                fontSize: 12, fontFamily: 'inherit',
                background: on ? 'var(--accent-bg)' : 'var(--bg-card)',
                border: `1px solid ${on ? 'var(--border-active)' : 'var(--border-default)'}`,
                color: on ? 'var(--accent)' : 'var(--text-secondary)',
                fontWeight: on ? 600 : 400,
              }}
            >
              {on ? '✓ ' : ''}{tweakChipLabel(t)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
