import ModalPortal from '../ModalPortal';

// Shared building blocks for the three scan result pages (barcode, photo,
// menu): a full-screen page with back arrow + title + pinned footer, small
// caps section labels, tinted chips, the iris "insight" card and the
// energy/macro card. Everything reads the app's tokens, so light/dark and the
// macro colours follow the theme with no per-screen colour logic.

const FONT = "'Plus Jakarta Sans', sans-serif";

const MACRO_COLOR = {
  protein: 'var(--macro-protein)',
  carbs: 'var(--macro-carbs)',
  fat: 'var(--macro-fat)',
};

const tint = (color, pct = 14) => `color-mix(in srgb, ${color} ${pct}%, var(--bg-card))`;
const ink = (color) => `color-mix(in srgb, ${color} 72%, var(--text-primary))`;

export function ScanPage({ title, onBack, closing, headerRight, footer, children, backLabel = 'Close', testId }) {
  return (
    <ModalPortal>
      <div
        className={`sheet-panel${closing ? ' is-closing' : ''}`}
        data-testid={testId}
        style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', fontFamily: FONT }}
      >
        <div style={{ flexShrink: 0, paddingTop: 'env(safe-area-inset-top)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px 10px', minWidth: 0 }}>
            <button
              type="button" onClick={onBack} aria-label={backLabel} title={backLabel}
              style={{ width: 40, height: 40, flexShrink: 0, borderRadius: '50%', background: 'var(--bg-card)', border: '1px solid var(--card-border)', color: 'var(--text-primary)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
            >
              <i className="ti ti-arrow-left" aria-hidden="true" />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              {typeof title === 'string'
                ? <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
                : title}
            </div>
            {headerRight}
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '4px 16px 24px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>{children}</div>
        </div>
        {footer && (
          <div style={{ flexShrink: 0, padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', background: 'var(--bg-primary)', borderTop: '1px solid var(--border-default)' }}>
            <div style={{ maxWidth: 560, margin: '0 auto' }}>{footer}</div>
          </div>
        )}
      </div>
    </ModalPortal>
  );
}

// A rounded white "bento" card used for every block on the scan pages.
export function ScanCard({ children, style, ...rest }) {
  return (
    <div
      style={{ background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 'var(--card-radius)', boxShadow: 'var(--card-shadow)', padding: 16, marginBottom: 12, minWidth: 0, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children, style }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', ...style }}>
      {children}
    </div>
  );
}

// Small pill. `color` tints it (text + soft background); no colour = neutral.
export function Chip({ children, color, icon, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, maxWidth: '100%',
      fontSize: 11, fontWeight: 700, lineHeight: 1.3, whiteSpace: 'nowrap',
      color: color ? ink(color) : 'var(--text-secondary)',
      background: color ? tint(color, 16) : 'var(--chip-bg)',
      ...style,
    }}>
      {icon && <i className={`ti ${icon}`} aria-hidden="true" style={{ fontSize: 12, flexShrink: 0 }} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  );
}

// The iris-tinted "Smart synergy / Dining advice / Target synergy" card.
export function InsightCard({ icon = 'ti-bolt', title, tag, children, style }) {
  return (
    <div style={{
      display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12, padding: 14, minWidth: 0,
      borderRadius: 'var(--card-radius)', background: 'var(--accent-bg)', border: '1px solid var(--accent-border)', ...style,
    }}>
      <span aria-hidden="true" style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 12, background: 'var(--accent)', color: 'var(--accent-contrast)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
        <i className={`ti ${icon}`} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.02em' }}>{title}</span>
          {tag && <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-secondary)' }}>{tag}</span>}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{children}</div>
      </div>
    </div>
  );
}

// Thin stacked bar showing where a food's calories come from.
export function SplitBar({ split }) {
  if (!split) return null;
  return (
    <>
      <div role="img" aria-label={`Calories from protein ${split.protein}%, carbs ${split.carbs}%, fat ${split.fat}%`} style={{ display: 'flex', gap: 2, height: 8, borderRadius: 99, overflow: 'hidden', marginTop: 12 }}>
        {['protein', 'carbs', 'fat'].map(k => split[k] > 0 && (
          <div key={k} style={{ width: `${split[k]}%`, background: MACRO_COLOR[k] }} />
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
        {[['protein', 'Protein'], ['carbs', 'Carbs'], ['fat', 'Fat']].map(([k, label]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: MACRO_COLOR[k] }} />
            {label} ({split[k]}%)
          </span>
        ))}
      </div>
    </>
  );
}

// One coloured macro box: caps label, big value, small descriptor chip.
export function MacroTile({ kind, label, value, unit = 'g', note }) {
  const color = MACRO_COLOR[kind] || 'var(--accent-secondary)';
  return (
    <div style={{ flex: '1 1 0', minWidth: 0, borderRadius: 16, padding: '10px 8px 10px 12px', background: tint(color, 13) }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: ink(color), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '2px 0 4px', whiteSpace: 'nowrap' }}>
        {value}<span style={{ fontSize: 13, fontWeight: 700 }}>{unit}</span>
      </div>
      {note
        ? <span style={{ display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', padding: '1px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: ink(color), background: tint(color, 22), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note}</span>
        : <span style={{ display: 'block', height: 16 }} />}
    </div>
  );
}

// Pill-shaped choice (meal slot, portion preset, menu filter).
export function PillButton({ active, onClick, children, style, ...rest }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={active}
      style={{
        flexShrink: 0, minHeight: 36, padding: '0 14px', borderRadius: 99, cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
        background: active ? 'var(--accent)' : 'var(--chip-bg)',
        color: active ? 'var(--accent-contrast)' : 'var(--text-secondary)',
        border: '1px solid transparent', ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

// A row of PillButtons: scrolls sideways by default, or wraps (`wrap`) when
// every option should stay visible, like the four meals.
export function PillRow({ children, style, label, wrap = false }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 8, ...(wrap ? { flexWrap: 'wrap' } : { overflowX: 'auto', margin: '0 -2px', padding: '2px', scrollbarWidth: 'none' }), ...style }}>
      {children}
    </div>
  );
}

// Primary / secondary pinned-footer buttons.
export function PrimaryButton({ children, disabled, style, ...rest }) {
  return (
    <button
      type="button" disabled={disabled}
      style={{
        width: '100%', minHeight: 54, padding: '0 16px', borderRadius: 18, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: FONT,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 15, fontWeight: 800, minWidth: 0,
        background: disabled ? 'var(--border-default)' : 'var(--accent)',
        color: disabled ? 'var(--text-muted)' : 'var(--accent-contrast)', ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, style, ...rest }) {
  return (
    <button
      type="button"
      style={{ minHeight: 44, padding: '0 14px', borderRadius: 14, border: 'none', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconTile({ icon, size = 44, color = 'var(--accent-secondary)', style }) {
  return (
    <span aria-hidden="true" style={{ width: size, height: size, flexShrink: 0, borderRadius: Math.round(size * 0.3), background: tint(color, 16), color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.5), ...style }}>
      <i className={`ti ${icon}`} />
    </span>
  );
}
