// Crash reports (Sentry) and feature-usage analytics (PostHog). Both are inert
// until their key exists in the environment (VITE_SENTRY_DSN / VITE_POSTHOG_KEY),
// load lazily so they never slow startup, and swallow every failure: telemetry
// must never be able to break the app. Never send food, weight or other health values.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
const PH_KEY = import.meta.env.VITE_POSTHOG_KEY;
const PH_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

let posthog = null;
let sentry = null;

export async function initTelemetry() {
  if (SENTRY_DSN) {
    try {
      const S = await import('@sentry/react');
      S.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0,
        sendDefaultPii: false,
        beforeSend(event) { if (event.user) event.user = { id: event.user.id }; return event; },
      });
      sentry = S;
    } catch { /* ignore */ }
  }
  if (PH_KEY) {
    try {
      const mod = await import('posthog-js');
      mod.default.init(PH_KEY, {
        api_host: PH_HOST,
        autocapture: false,
        capture_pageview: false,
        person_profiles: 'identified_only',
        disable_session_recording: true,
      });
      posthog = mod.default;
    } catch { /* ignore */ }
  }
}

export function identifyUser(id) {
  try { posthog?.identify(id); sentry?.setUser({ id }); } catch { /* ignore */ }
}
export function resetUser() {
  try { posthog?.reset(); sentry?.setUser(null); } catch { /* ignore */ }
}
export function track(event, props) {
  try { posthog?.capture(event, props); } catch { /* ignore */ }
}
export function captureError(err) {
  try { sentry?.captureException(err); } catch { /* ignore */ }
}
