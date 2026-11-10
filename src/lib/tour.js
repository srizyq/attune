// Shared between the Dashboard tour and the "Replay tour" button in Settings.
export const TOUR_KEY = 'attune.tourSeen.v2';
export const REPLAY_KEY = 'attune.tourReplay';
export const TOUR_EVENT = 'attune:tour';

export function tourSeen() { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch { return true; } }
export function markTourSeen() { try { localStorage.setItem(TOUR_KEY, '1'); } catch { /* ignore */ } }

// Marks the next visit to the Dashboard to start the tour (used by "Replay tour" in Settings).
export function requestTourReplay() {
  try { sessionStorage.setItem(REPLAY_KEY, '1'); } catch { /* ignore */ }
  window.dispatchEvent(new Event(TOUR_EVENT));
}
export function takeTourReplay() {
  try {
    const v = sessionStorage.getItem(REPLAY_KEY) === '1';
    sessionStorage.removeItem(REPLAY_KEY);
    return v;
  } catch { return false; }
}
