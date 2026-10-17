// A tiny app-wide "toast" bus, for confirmations that must outlive the screen
// that caused them (a scan page logs food and then closes itself). The host in
// App.jsx listens and shows it; anything can call showAppToast().
const EVENT = 'attune:toast';

export function showAppToast(message, isError = false) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, isError } }));
}

export function onAppToast(handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
