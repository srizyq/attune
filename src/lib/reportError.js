// Sends crashes to the client_errors table (see schema.sql) so there's some
// way to learn that something broke on a phone. Everything here is
// best-effort: reporting must never throw, never block, and never become a
// second source of errors — so it is capped per session, de-duplicated, and
// swallows its own failures (including the table not existing yet).
import { supabase } from './supabase';

const MAX_REPORTS_PER_SESSION = 5;
// Browser noise that isn't a bug in this app.
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Loading chunk .* failed/i, /Failed to fetch dynamically imported module/i];

const seen = new Set();
let sent = 0;

export function shouldReport(message) {
  if (!message || IGNORED.some((re) => re.test(message))) return false;
  if (seen.has(message) || sent >= MAX_REPORTS_PER_SESSION) return false;
  return true;
}

export async function reportError(error, extra = {}) {
  try {
    const message = String(error?.message || error || '').slice(0, 1000);
    if (!shouldReport(message)) return;
    seen.add(message);
    sent += 1;
    const { data } = await supabase.auth.getSession();
    await supabase.from('client_errors').insert({
      user_id: data?.session?.user?.id ?? null,
      message,
      stack: String(error?.stack || extra.componentStack || '').slice(0, 4000) || null,
      route: window.location.pathname.slice(0, 300),
      user_agent: navigator.userAgent.slice(0, 300),
    });
  } catch {
    // Reporting is best-effort.
  }
}

export function installGlobalErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason));
}

// For tests.
export function _resetReporting() { seen.clear(); sent = 0; }
