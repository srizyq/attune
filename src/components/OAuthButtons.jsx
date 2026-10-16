import { useEffect, useState } from 'react';
import { enabledOAuthProviders } from '../lib/oauth';

const ICONS = {
  google: (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.4 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/>
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  ),
  apple: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.9-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4zM13.9 5.1c.7-.9 1.2-2 1-3.1-1 0-2.2.7-2.9 1.5-.6.7-1.2 1.9-1 3 1.1.1 2.2-.6 2.9-1.4z"/>
    </svg>
  ),
};

// Shared by Login and onboarding Step4 — `onSelect(providerId)` does the
// actual redirect; this only renders the buttons. A divider ("or") is part of
// it so both screens stay visually identical.
export default function OAuthButtons({ onSelect, disabled, verb = 'Continue' }) {
  // Only providers that are switched on: none until that is known, and none at all if none are.
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    let cancelled = false;
    enabledOAuthProviders().then((list) => { if (!cancelled) setProviders(list); });
    return () => { cancelled = true; };
  }, []);
  if (providers.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {providers.map(p => (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(p.id)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', minHeight: 48, padding: '12px',
              background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
              borderRadius: 10, color: 'var(--text-primary)', fontSize: 15, fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            {ICONS[p.id]}
            {verb} with {p.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, color: 'var(--text-hint)', fontSize: 12 }}>
        <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
        or
        <span style={{ flex: 1, height: 1, background: 'var(--border-default)' }} />
      </div>
    </div>
  );
}
