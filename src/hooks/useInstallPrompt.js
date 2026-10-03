import { useCallback, useEffect, useState } from 'react';
import { DISMISS_KEY, detectInstallEnvironment, recordVisitDay, shouldShowInstallPrompt } from '../lib/installPrompt';
import { todayLocalDate } from '../lib/patterns';

function readEnv() {
  if (typeof window === 'undefined') return 'other';
  return detectInstallEnvironment({
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: navigator.standalone === true,
    displayStandalone: !!window.matchMedia?.('(display-mode: standalone)').matches,
  });
}

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

/**
 * Whether to show the "install Attune" prompt, and how to act on it:
 *  mode 'native' — the browser handed us an install dialog (Chrome/Android/desktop): install()
 *  mode 'ios'    — manual: Share -> Add to Home Screen, so the UI shows the steps
 */
export function useInstallPrompt() {
  const [env] = useState(readEnv);
  const [deferred, setDeferred] = useState(null);
  const [visitDays] = useState(() => (typeof window === 'undefined' ? 0 : recordVisitDay(localStorage, todayLocalDate())));
  const [dismissedAt, setDismissedAt] = useState(() => read(DISMISS_KEY));
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBefore = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    const now = new Date().toISOString();
    try { localStorage.setItem(DISMISS_KEY, now); } catch { /* best-effort */ }
    setDismissedAt(now);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    if (choice?.outcome === 'dismissed') dismiss();
  }, [deferred, dismiss]);

  const show = !installed && shouldShowInstallPrompt({ env, nativePromptAvailable: !!deferred, dismissedAt, visitDays });
  return { show, mode: env === 'ios' ? 'ios' : 'native', install, dismiss };
}
