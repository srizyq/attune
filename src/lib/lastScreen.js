// The last screen someone was on before they opened Settings to report a
// problem, so the report says where it happened. Kept for the tab's lifetime.
const KEY = 'attune_last_screen';

export function rememberScreen(pathname) {
  if (!pathname || pathname.startsWith('/settings') || pathname.startsWith('/admin')) return;
  try { sessionStorage.setItem(KEY, pathname.slice(0, 300)); } catch { /* storage blocked */ }
}

export function lastScreen() {
  try { return sessionStorage.getItem(KEY) || null; } catch { return null; }
}
