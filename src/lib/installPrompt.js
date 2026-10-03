// Working out whether to offer "install Attune", and how. Installed (Add to
// Home Screen) it opens full-screen like an app, loads faster, and — on
// iPhone — is the only way reminder push notifications work at all, so it's
// worth a nudge; but only once, never nagging, and never for people who
// already did it.

export const DISMISS_KEY = 'attune_install_prompt_dismissed_at';
export const VISITS_KEY = 'attune_install_prompt_visits';
export const DISMISS_DAYS = 21;
export const MIN_VISIT_DAYS = 2; // don't greet a brand-new user with it

/**
 * @returns 'installed' | 'ios' | 'other'
 *  - installed: already running as a home-screen app
 *  - ios: iPhone/iPad, where installing is manual (Share -> Add to Home Screen)
 *  - other: anything else; a native prompt is only available if the browser
 *    has fired `beforeinstallprompt` (the hook tracks that separately)
 */
export function detectInstallEnvironment({ userAgent = '', maxTouchPoints = 0, platform = '', standalone = false, displayStandalone = false } = {}) {
  if (standalone || displayStandalone) return 'installed';
  // iPadOS 13+ reports itself as a Mac; the touch screen gives it away.
  const isIos = /iPhone|iPad|iPod/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
  if (!isIos) return 'other';
  // In-app browsers (Instagram, Facebook, Gmail...) have no Share -> Add to
  // Home Screen at all, so there's nothing useful to point at.
  if (/FBAN|FBAV|Instagram|Line\/|MicroMessenger|GSA\//.test(userAgent)) return 'other';
  return 'ios';
}

/** Whole days since an ISO timestamp, or Infinity if there is none. */
function daysSince(iso, now) {
  const t = Date.parse(iso || '');
  return Number.isFinite(t) ? (now - t) / 86_400_000 : Infinity;
}

/**
 * Show the prompt only to people who could act on it, have been around for a
 * couple of days, and haven't waved it away recently.
 */
export function shouldShowInstallPrompt({ env, nativePromptAvailable = false, dismissedAt = null, visitDays = 0, now = Date.now() }) {
  if (env === 'installed') return false;
  if (env === 'other' && !nativePromptAvailable) return false;
  if (visitDays < MIN_VISIT_DAYS) return false;
  return daysSince(dismissedAt, now) >= DISMISS_DAYS;
}

/** Records today as a visit day; returns the new count. Storage is best-effort. */
export function recordVisitDay(storage, today) {
  try {
    const prev = JSON.parse(storage.getItem(VISITS_KEY) || '{}');
    const days = Array.isArray(prev.days) ? prev.days : [];
    if (!days.includes(today)) days.push(today);
    const kept = days.slice(-30);
    storage.setItem(VISITS_KEY, JSON.stringify({ days: kept }));
    return kept.length;
  } catch {
    return 0;
  }
}
