// Downloads the app's secondary pages in the background once the first screen
// is up, so opening one later doesn't wait on a download (inside the iPhone app
// every page's code comes over the network). One page at a time, only when the
// phone is idle and not on data-saver, and a failed download is simply skipped:
// the page still loads normally when it's opened.
const GAP_MS = 150;

function whenIdle(fn) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) return window.requestIdleCallback(fn, { timeout: 4000 });
  return setTimeout(fn, GAP_MS);
}

export function preloadPages(loaders, { saveData = typeof navigator !== 'undefined' && navigator.connection?.saveData } = {}) {
  if (saveData) return () => {};
  let cancelled = false;
  const queue = [...loaders];
  const next = () => {
    if (cancelled || queue.length === 0) return;
    const load = queue.shift();
    Promise.resolve().then(load).catch(() => {}).finally(() => { if (!cancelled) setTimeout(() => whenIdle(next), GAP_MS); });
  };
  whenIdle(next);
  return () => { cancelled = true; };
}
