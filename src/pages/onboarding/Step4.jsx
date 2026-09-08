// src/pages/onboarding/Step4.jsx
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import OnboardingLayout from '../../components/OnboardingLayout';
import { supabase } from '../../lib/supabase';
import { getProfile, upsertProfile, upsertWeightLog } from '../../lib/db';
import { todayLocalDate } from '../../lib/patterns';

// Writing to `profiles` immediately after a fresh signInAnonymously()
// can occasionally hit "new row violates row-level security policy"
// (42501) — the very next request can race the client's own auth
// context settling onto the brand-new session. Confirmed reproducible
// with a hard page load followed by an instant click; a short retry is
// the standard, low-risk way to ride out a timing window like this
// rather than surfacing a scary error for what's really just "try again
// in a moment."
// Bumped from 3 attempts/250ms (750ms total budget) to 5/400ms (2s) —
// caught this race firing for real while testing the weight_logs seed
// added alongside the profile upsert below: two sequential writes in the
// same post-signInAnonymously() window means twice the exposure to the
// exact timing race this retry exists for, so the original budget wasn't
// generous enough anymore.
async function withRetry(fn, attempts = 5, delayMs = 400) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function randomGuestName() {
  return `Guest ${Math.floor(1000 + Math.random() * 9000)}`;
}

function readPreAuthTheme() {
  try {
    return sessionStorage.getItem('attune_preauth_theme') === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function draftToProfileFields(draft) {
  const targets = draft.targets || {};
  return {
    name: draft.name || randomGuestName(),
    goal: draft.goal || null,
    age: draft.age ?? null,
    date_of_birth: draft.dateOfBirth || null,
    sex: draft.sex || 'unspecified',
    weight: draft.weight ?? null,
    target_weight: draft.targetWeight ?? null,
    height: draft.height ?? null,
    unit: draft.unit || 'metric',
    activity: draft.activity || null,
    pace_kg_per_week: draft.paceKgPerWeek ?? null,
    theme: readPreAuthTheme(),
    calorie_target: targets.calories ?? null,
    protein_g: targets.protein?.g ?? null,
    carbs_g: targets.carbs?.g ?? null,
    fat_g: targets.fat?.g ?? null,
    water_target: targets.water ?? 8,
    onboarding_completed: true,
  };
}

// The final screen is a single soft upgrade prompt, not a hard fork
// between "create account" and "continue as guest" — by the time this
// screen is interactive, a guest session already exists and everything
// collected so far is already saved to it. "Maybe later" just continues;
// the form here only ever *upgrades* that same session to a permanent
// one (via updateUser, matching Settings' UpgradeForm) rather than
// competing with it via a fresh signUp.
export default function Step4() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preparing, setPreparing] = useState(true);
  const [prepError, setPrepError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [upgraded, setUpgraded] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const userIdRef = useRef(null);
  // Guards against this whole block running twice — React's StrictMode
  // double-invokes effects in dev specifically to catch ones that aren't
  // safe to run more than once, and this one wasn't: a second invocation
  // would re-read sessionStorage after the first had already cleared it,
  // silently upserting the profile again with an empty draft and wiping
  // out the goal/stats/targets the first invocation had just written.
  // Set synchronously before the first `await` so a second invocation
  // (which React fires only after this one has already yielded once)
  // always sees it as already claimed.
  const hasRunRef = useRef(false);

  useEffect(() => {
    (async () => {
      if (hasRunRef.current) return;
      hasRunRef.current = true;
      // Captured once, up front, rather than re-read after other async
      // work — the one thing that made the double-invocation bug above
      // possible was reading sessionStorage a second time instead of
      // trusting a value already in hand.
      const rawDraft = sessionStorage.getItem('attune_onboarding');
      try {
        // Reuse an existing session if one's already there (e.g. you hit
        // "skip" a second time, or came back via the browser's back
        // button) instead of spinning up a redundant guest account.
        const { data: { session } } = await supabase.auth.getSession();
        let userId = session?.user?.id;
        if (!userId) {
          const { data, error: anonError } = await supabase.auth.signInAnonymously();
          if (anonError) throw anonError;
          userId = data.user.id;
        }
        userIdRef.current = userId;
        // Only seed the profile from the draft if one doesn't already
        // exist — revisiting this screen (browser back, "skip" a second
        // time, a stale bookmark) reuses the same session, and by then
        // sessionStorage's draft is already empty, so writing it
        // unconditionally would silently wipe real goal/stats/target
        // data back to null on every repeat visit.
        const existingProfile = await withRetry(() => getProfile(userId));
        if (!existingProfile) {
          const draft = JSON.parse(rawDraft || '{}');
          await withRetry(() => upsertProfile(userId, draftToProfileFields(draft)));
          // The weight collected during onboarding only ever reached
          // profiles.weight — Dashboard's weight tile and Progress' weight
          // chart both read from weight_logs instead, which stayed empty,
          // so a freshly onboarded account looked like it had never logged
          // a weight at all. Seed today's entry from the same value.
          if (draft.weight) {
            await withRetry(() => upsertWeightLog(userId, todayLocalDate(), Number(draft.weight), draft.unit === 'imperial' ? 'lb' : 'kg'));
          }
        }
        sessionStorage.removeItem('attune_onboarding');
        sessionStorage.removeItem('attune_preauth_theme');
      } catch (err) {
        console.error('Failed to prepare guest session:', err);
        setPrepError("Couldn't set things up — try again.");
      } finally {
        setPreparing(false);
      }
    })();
  }, []);

  async function handleUpgrade() {
    if (!email || password.length < 8 || !userIdRef.current) return;
    setLoading(true);
    setError(null);
    if (name) {
      try { await upsertProfile(userIdRef.current, { name }); } catch { /* non-fatal — email/password still matter more */ }
    }
    const { error: updateError } = await supabase.auth.updateUser({ email, password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message.includes('already registered')
        ? 'That email is already registered — try logging in instead.'
        : updateError.message);
      return;
    }
    setUpgraded(true);
  }

  const inputStyle = (filled) => ({
    background: 'var(--bg-subtle)',
    border: `1px solid ${filled ? 'var(--border-active)' : 'var(--border-default)'}`,
    borderRadius: '10px',
    padding: '14px 16px',
    color: 'var(--text-primary)',
    fontSize: '16px',
    fontFamily: "'DM Sans', sans-serif",
    width: '100%',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.2s',
  });

  if (preparing) {
    return (
      <OnboardingLayout step={4}>
        <p style={{ color: 'var(--text-muted)' }}>Setting things up…</p>
      </OnboardingLayout>
    );
  }

  if (upgraded) {
    return (
      <OnboardingLayout step={4}>
        <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px', background: 'var(--accent-bg)',
            border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '28px', margin: '0 auto 24px',
          }}>✉️</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Almost there
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '24px' }}>
            Check your email to confirm <span style={{ color: 'var(--text-secondary)' }}>{email}</span> — everything you've already logged stays right where it is.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '14px 28px', background: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: '10px', color: '#0f0f0f',
              fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}
          >Continue to dashboard →</button>
        </div>
      </OnboardingLayout>
    );
  }

  return (
    <OnboardingLayout step={4}>
      <div style={{ width: '100%', maxWidth: '480px', textAlign: 'center' }}>

        <div style={{
          width: '64px', height: '64px', borderRadius: '16px', background: 'var(--accent-bg)',
          border: '1px solid var(--accent-border)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: '28px', margin: '0 auto 24px',
        }}>🌿</div>

        <p style={{ color: 'var(--text-muted)', fontSize: '13px', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '12px' }}>
          you're all set
        </p>
        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 'clamp(26px, 4vw, 36px)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.2,
          marginBottom: '8px',
        }}>
          Ready to start tracking
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', marginBottom: '36px' }}>
          You're already set up as a guest — save your progress with an account, or keep going and do it later from Settings.
        </p>

        <div style={{ textAlign: 'left', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            placeholder="Your name (optional)"
            value={name}
            onChange={e => setName(e.target.value)}
            onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
            onBlur={e => e.target.style.borderColor = name ? 'var(--border-active)' : 'var(--border-default)'}
            style={inputStyle(name)}
          />
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
            onBlur={e => e.target.style.borderColor = email ? 'var(--border-active)' : 'var(--border-default)'}
            style={inputStyle(email)}
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password (min. 8 characters)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onFocus={e => e.target.style.borderColor = 'var(--accent-dark)'}
            onBlur={e => e.target.style.borderColor = password ? 'var(--border-active)' : 'var(--border-default)'}
            style={inputStyle(password)}
            autoComplete="new-password"
          />
          {(prepError || error) && (
            <div style={{
              background: '#1a0f0f', border: '1px solid #c0707040', borderRadius: '8px',
              padding: '10px 14px', fontSize: '13px', color: 'var(--danger)',
            }}>{prepError || error}</div>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: '14px', fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            style={{ marginTop: 2, flexShrink: 0, accentColor: 'var(--accent)' }}
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Privacy Policy</a>
          </span>
        </label>

        <button
          onClick={handleUpgrade}
          disabled={!email || password.length < 8 || loading || !!prepError || !agreed}
          style={{
            width: '100%',
            padding: '16px',
            background: email && password.length >= 8 && agreed ? 'var(--accent)' : 'var(--bg-card)',
            border: `1px solid ${email && password.length >= 8 && agreed ? 'var(--accent)' : 'var(--border-default)'}`,
            borderRadius: '10px',
            color: email && password.length >= 8 && agreed ? '#0f0f0f' : 'var(--text-hint)',
            fontSize: '15px',
            fontWeight: 600,
            cursor: email && password.length >= 8 && agreed && !loading ? 'pointer' : 'not-allowed',
            fontFamily: "'DM Sans', sans-serif",
            transition: 'all 0.2s ease',
            marginBottom: '14px',
          }}
        >
          {loading ? 'Creating account…' : 'Create account & continue →'}
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '13px',
            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", marginBottom: '20px',
          }}
        >
          Maybe later
        </button>

        <p style={{ color: 'var(--text-hint)', fontSize: '12px', lineHeight: 1.6 }}>
          No credit card, ever. You're saved as a guest for 7 days either way — creating an account just makes it permanent.
        </p>
      </div>
    </OnboardingLayout>
  );
}
