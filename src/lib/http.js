// fetch with a deadline. A bare fetch() waits forever on a hung connection, so
// a stalled food lookup or AI scan leaves its spinner up with no way out. This
// aborts after `timeoutMs` (default 45s — AI scans are slow) and throws an
// error the existing catch blocks already handle like any network failure.
// A caller's own `signal` still works: either one aborting cancels the request.
export const DEFAULT_TIMEOUT_MS = 45000;

export async function fetchWithTimeout(url, options = {}) {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal, ...init } = options;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onCallerAbort, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new Error('The request timed out. Check your connection and try again.', { cause: err });
    throw err;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
