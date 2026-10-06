import ModalPortal from '../ModalPortal';
import { useClosingTransition } from '../../hooks/useClosingTransition';

/**
 * A short list of choices sliding up from the bottom (a post's "…" menu).
 * `actions`: [{ label, icon, danger, onSelect }]. Choosing one closes the sheet first.
 */
export default function ActionSheet({ title, actions, onClose }) {
  const { closing, close } = useClosingTransition(onClose);
  return (
    <ModalPortal>
      <div onClick={close} className={`modal-backdrop${closing ? ' is-closing' : ''}`} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300 }}>
        <div
          role="dialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={`sheet-panel${closing ? ' is-closing' : ''}`}
          style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderBottom: 'none', borderRadius: '24px 24px 0 0', padding: '12px 16px calc(16px + env(safe-area-inset-bottom))' }}
        >
          <div style={{ width: 36, height: 5, borderRadius: 99, background: 'var(--border-strong)', margin: '0 auto 12px' }} />
          {title && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginBottom: 6 }}>{title}</div>}
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              onClick={() => { close(); setTimeout(a.onSelect, 170); }}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)', color: a.danger ? 'var(--danger)' : 'var(--text-primary)', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', padding: '0 4px' }}
            >
              {a.icon && <i className={`ti ${a.icon}`} aria-hidden="true" style={{ fontSize: 19 }} />}{a.label}
            </button>
          ))}
          <button type="button" onClick={close} style={{ width: '100%', minHeight: 48, marginTop: 8, background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </ModalPortal>
  );
}
