// The last few error messages the app logged this session, so a problem report
// can say what had just gone wrong. Messages only (clipped, no objects), and
// nothing here is sent anywhere until the person submits a report.
const MAX = 10;
const LIMIT = 300;
let recent = [];

const text = (arg) => {
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'string') return arg;
  return '';
};

export function recordRecentError(...args) {
  const line = args.map(text).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, LIMIT);
  if (!line || recent.at(-1) === line) return;
  recent.push(line);
  if (recent.length > MAX) recent = recent.slice(-MAX);
  try { sessionStorage.setItem('attune_recent_errors', JSON.stringify(recent)); } catch { /* storage blocked */ }
}

export function getRecentErrors() {
  if (recent.length) return [...recent];
  // After a reload (the crash screen's Reload button) the list survives in the tab.
  try { return JSON.parse(sessionStorage.getItem('attune_recent_errors') || '[]').filter((e) => typeof e === 'string').slice(-MAX); } catch { return []; }
}

export function installRecentErrorCapture() {
  const original = console.error;
  console.error = (...args) => {
    try { recordRecentError(...args); } catch { /* never get in the way of logging */ }
    original.apply(console, args);
  };
  window.addEventListener('error', (e) => recordRecentError(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => recordRecentError(e.reason));
}

// For tests.
export function _resetRecentErrors() { recent = []; try { sessionStorage.removeItem('attune_recent_errors'); } catch { /* ignore */ } }
