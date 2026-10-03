import { useEffect, useRef, useState } from 'react';
import { supabase, passwordResetRedirectTo } from '../lib/supabase';
import { getCaptchaToken } from '../lib/captcha';

const DEFAULT_COOLDOWN_S = 30;
// Same rate-limit message shape as Supabase's other auth emails — see
// useResendConfirmation's identical pattern, which this mirrors rather
// than shares: resetPasswordForEmail is a different Supabase call from
// auth.resend(), so the two hooks don't have a clean common base without
// touching the already-working confirmation-resend flow for a second,
// unrelated use case.
const RATE_LIMIT_SECONDS = /after (\d+) seconds/i;

// Deliberately never reveals whether the email is registered —
// resetPasswordForEmail succeeds either way by design (Supabase's own
// anti-enumeration behaviour), so "sent" here just means the request went
// through, not that an account exists.
export function usePasswordResetRequest(email) {
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const tickRef = useRef(null);

  useEffect(() => () => clearInterval(tickRef.current), []);

  function startCooldown(seconds) {
    clearInterval(tickRef.current);
    setSecondsLeft(seconds);
    tickRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { clearInterval(tickRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
  }

  async function sendReset() {
    if (!email || status === 'sending' || secondsLeft > 0) return;
    setStatus('sending');
    setErrorMessage(null);
    let captchaToken;
    try { captchaToken = await getCaptchaToken(); } catch { /* Supabase will reject a missing token itself when the check is on */ }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: passwordResetRedirectTo, ...(captchaToken ? { captchaToken } : {}) });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message || 'Could not send that — try again.');
      const match = error.message?.match(RATE_LIMIT_SECONDS);
      startCooldown(match ? Number(match[1]) : DEFAULT_COOLDOWN_S);
    } else {
      setStatus('sent');
      startCooldown(DEFAULT_COOLDOWN_S);
    }
  }

  return { status, errorMessage, secondsLeft, canSend: !!email && status !== 'sending' && secondsLeft === 0, sendReset };
}
