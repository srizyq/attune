import { useEffect, useRef, useState } from 'react';
import { supabase, emailRedirectTo } from '../lib/supabase';

const DEFAULT_COOLDOWN_S = 30;
// Supabase's rate-limit error reads like "For security purposes, you can
// only request this after 47 seconds." — pull the real wait out of it
// instead of guessing, so the countdown matches what the server will
// actually accept.
const RATE_LIMIT_SECONDS = /after (\d+) seconds/i;

// All three "resend confirmation" buttons (Step5, Login, Profile) used to
// swap themselves for static "Confirmation email sent." text on success and
// never come back — meaning if that first send was silently dropped (e.g.
// Supabase's built-in mailer rate limit with no custom SMTP configured),
// the user was stuck with no way to ever trigger another attempt short of
// reloading the page. This hook keeps the button live behind a cooldown
// instead of retiring it permanently.
export function useResendConfirmation(email) {
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

  async function resend() {
    if (!email || status === 'sending' || secondsLeft > 0) return;
    setStatus('sending');
    setErrorMessage(null);
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
    if (error) {
      setStatus('error');
      setErrorMessage(error.message || 'Could not resend — try again.');
      const match = error.message?.match(RATE_LIMIT_SECONDS);
      startCooldown(match ? Number(match[1]) : DEFAULT_COOLDOWN_S);
    } else {
      setStatus('sent');
      startCooldown(DEFAULT_COOLDOWN_S);
    }
  }

  return { status, errorMessage, secondsLeft, canResend: !!email && status !== 'sending' && secondsLeft === 0, resend };
}
