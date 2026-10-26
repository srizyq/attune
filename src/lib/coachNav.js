// Whether the signed-in person is a coach, remembered on this device so the
// bottom nav can show the right tab on first paint (AppNav is on every page and
// shouldn't each fetch a profile to decide). It is only a label choice — what a
// coach can actually do is decided by the database, never by this.
const KEY = 'attune_coach_nav';

export function rememberCoachNav(profile) {
  try {
    if (profile?.coach_pass) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* storage blocked — the nav just shows the default tab */ }
}

export function isCoachNav() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}
