import { useEffect, useRef, useState } from 'react';

const item = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 44, padding: '0 14px', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: 'pointer', fontFamily: "'Plus Jakarta Sans', sans-serif" };

// The "⋯" in a client's header: the things a coach does occasionally (name a
// group, export a report, disconnect) kept one step away from the page, so a
// stray tap can never disconnect someone. Disconnect asks before it does anything.
export default function ClientActionsMenu({ row, onSetGroup, onRevoke, onExport, readOnly = false }) {
  const [open, setOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(false);
  const [groupInput, setGroupInput] = useState('');
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);

  const close = (returnFocus = true) => {
    setOpen(false);
    setEditingGroup(false);
    if (returnFocus) triggerRef.current?.focus?.();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) close(false); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const canManage = !readOnly && row && onSetGroup && onRevoke;
  if (!canManage && !onExport) return null;
  const name = row?.client?.name || 'this client';

  const saveGroup = async () => {
    const label = groupInput.trim();
    // Don't hand focus to the "⋯" button here: the Enter that got us here is
    // still being typed, and the button would take it as a press and reopen.
    close(false);
    await onSetGroup(row.id, label);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className="app-icon-btn"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <i className="ti ti-dots" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Client actions"
          style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 30, minWidth: 230, background: 'var(--bg-card)', border: '1px solid var(--card-border)', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.35)', padding: '6px 0', overflow: 'hidden' }}
        >
          {canManage && (editingGroup ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px' }}>
              <input
                autoFocus
                value={groupInput}
                onChange={(e) => setGroupInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveGroup(); } }}
                placeholder="Group name"
                aria-label="Group name"
                style={{ flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', padding: '0 12px', fontSize: 16, background: 'var(--bg-primary)', border: '1px solid var(--border-strong)', borderRadius: 10, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }}
              />
              <button type="button" onClick={saveGroup} aria-label="Save group" className="btn-press" style={{ width: 44, height: 44, border: 'none', borderRadius: 10, background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 16, cursor: 'pointer' }}>
                <i className="ti ti-check" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button type="button" role="menuitem" aria-label="Set group" className="btn-press" style={item} onClick={() => { setGroupInput(row.group_label || ''); setEditingGroup(true); }}>
              <i className="ti ti-tag" aria-hidden="true" style={{ fontSize: 16, color: 'var(--text-muted)' }} />
              <span>{row.group_label ? `Group: ${row.group_label}` : 'Add to a group'}</span>
            </button>
          ))}
          {onExport && (
            <button type="button" role="menuitem" className="btn-press" style={item} onClick={() => { close(false); onExport(); }}>
              <i className="ti ti-file-analytics" aria-hidden="true" style={{ fontSize: 16, color: 'var(--text-muted)' }} />
              <span>Export a report</span>
            </button>
          )}
          {canManage && (
            <>
              <div style={{ height: 1, background: 'var(--border-default)', margin: '6px 0' }} />
              <button
                type="button"
                role="menuitem"
                aria-label="Disconnect client"
                className="btn-press"
                style={{ ...item, color: 'var(--danger)' }}
                onClick={() => {
                  if (window.confirm(`Disconnect ${name}? You'll lose access to their data immediately.`)) { close(false); onRevoke(row.id); }
                }}
              >
                <i className="ti ti-user-minus" aria-hidden="true" style={{ fontSize: 16 }} />
                <span>Disconnect</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
