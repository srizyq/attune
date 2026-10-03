import { Component } from 'react';
import { reportError } from '../lib/reportError';

// Catches a crash while rendering any screen, so one bad component shows a
// recovery screen instead of leaving a blank page with no way out. It sits
// outside the router, so it uses plain links/reload rather than router hooks.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center', background: 'var(--bg-primary, #0f0f0f)', color: 'var(--text-primary, #fff)', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20 }}>Something went wrong</div>
        <p style={{ margin: 0, maxWidth: 320, fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary, #bbb)' }}>
          Attune hit an unexpected problem. Your logged data is safe. Reloading usually fixes it.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => window.location.reload()} style={{ padding: '11px 20px', borderRadius: 8, border: 'none', background: 'var(--accent, #e87d4a)', color: 'var(--accent-contrast, #fff)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reload
          </button>
          <a href="/dashboard" style={{ padding: '11px 20px', borderRadius: 8, border: '1px solid var(--border-default, #333)', color: 'var(--text-secondary, #bbb)', fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            Go to dashboard
          </a>
        </div>
      </div>
    );
  }
}
