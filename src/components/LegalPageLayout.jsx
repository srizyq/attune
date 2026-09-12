import { useNavigate } from 'react-router-dom';
import { usePreAuthTheme } from '../hooks/usePreAuthTheme';
import PreAuthThemeToggle from './PreAuthThemeToggle';

// Shared shell for /terms and /privacy — public routes (not behind
// RequireAuth) since prospective users need to read these before ever
// creating an account, not just from inside Settings. Uses the same
// pre-auth theme system as Login/Welcome/onboarding rather than the
// authenticated app's useTheme, since these pages have to work for
// visitors with no profile row at all.
export default function LegalPageLayout({ title, updated, children }) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = usePreAuthTheme();
  // Opened as its own tab (every link here uses target="_blank" so an
  // in-progress signup form elsewhere isn't lost by navigating away from
  // it) means this tab often has no history to go back to — navigate(-1)
  // then does nothing at all, stranding whoever taps Back with a page
  // that looks broken. Falling back to the marketing landing page when
  // there's nowhere to go back to at least always does something.
  function goBack() {
    if (window.history.length > 1) navigate(-1);
    else navigate('/');
  }

  return (
    // height: 100vh + an inner overflow: auto container, not plain
    // document/body scroll — every other page in the app already uses
    // this shape (see .app-content-pad's own comment about iOS momentum
    // scroll on nested containers); this was the one page that instead
    // relied on the body itself scrolling, which is exactly the case
    // that reads as "can't scroll at all" on real iOS Safari once
    // overflow-x: hidden is set globally on html/body (needed elsewhere
    // to stop the horizontal rubber-band bounce), even though it
    // scrolled fine in desktop testing.
    <div data-theme={theme} style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border-default)', flexShrink: 0 }}>
        <button onClick={goBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, display: 'flex' }} aria-label="Back">
          <i className="ti ti-arrow-left" />
        </button>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--accent)', letterSpacing: '-0.5px' }}>attune</span>
        <PreAuthThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 700, margin: '0 0 6px' }}>{title}</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 32px' }}>Last updated {updated}</p>
          <div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>{title}</h2>
      {children}
    </div>
  );
}

export function P({ children }) {
  return <p style={{ margin: '0 0 12px' }}>{children}</p>;
}

export function Ul({ items }) {
  return (
    <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>
      {items.map((item, i) => <li key={i} style={{ marginBottom: 6 }}>{item}</li>)}
    </ul>
  );
}
