import { useNavigate } from 'react-router-dom';

const chipStyle = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 10,
  padding: '9px 8px', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

// Sticky bottom bar under the Slots timeline — a single place for every way
// to log food, instead of the general "+" nav sheet (QuickActionSheet)
// which doesn't know which slot is "current". Search/barcode/mic all just
// navigate to the existing /food page (which already owns that whole
// experience — recorder, scanner, search); Quick Macro opens its sheet
// in-place instead, since a manual cal/P/C/F entry has nothing to search for.
export default function QuickAddBar({ selectedDate, currentSlotId, onOpenQuickMacro }) {
  const navigate = useNavigate();

  function go(extraState) {
    navigate('/food', { state: { date: selectedDate, presetSlotId: currentSlotId, ...extraState } });
  }

  return (
    <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg-primary)', paddingTop: 10, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)', border: '1px solid var(--border-default)', borderRadius: 12, padding: '9px 8px 9px 12px' }}>
        <button onClick={() => go({})} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', color: 'var(--text-hint)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8, padding: 0 }}>
          <i className="ti ti-search" style={{ flexShrink: 0 }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Scan barcode, describe food, or type…</span>
        </button>
        <button onClick={() => go({ openVoice: true })} title="Voice search" aria-label="Voice search" className="hit-slop" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
          <i className="ti ti-microphone" />
        </button>
        <button onClick={() => go({ openScan: true })} title="Scan barcode" aria-label="Scan barcode" className="hit-slop" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
          <i className="ti ti-barcode" />
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onOpenQuickMacro} style={chipStyle}><i className="ti ti-bolt" /> Quick Macro</button>
        <button onClick={() => go({})} style={chipStyle}><i className="ti ti-history" /> Frequent</button>
        <button onClick={() => navigate('/expenditure')} style={chipStyle}><i className="ti ti-scale" /> Weight Log</button>
      </div>
    </div>
  );
}
