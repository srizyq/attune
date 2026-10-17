// The three scan screens are real pages (barcode, photo, menu), reached from
// the quick-add sheet, Food search, the Log page's quick bar and the recipe
// builder. Everything about where they live is here, so a link, a redirect and
// a test all agree.
export const SCAN_PATHS = {
  barcode: '/scan/barcode',
  photo: '/scan/photo',
  menu: '/scan/menu',
};

// Before the scans were pages they opened on top of Food search through router
// state flags ({ openScan: true } and friends). Old links, saved shortcuts and
// tests may still use them, so Food search forwards them to the right page.
export function legacyScanKind(state) {
  if (!state) return null;
  if (state.openScan) return 'barcode';
  if (state.openPhotoScan) return 'photo';
  if (state.openMenuScan) return 'menu';
  return null;
}

// Strips the flags and keeps the rest (date, meal, time, slot, recipe).
export function withoutLegacyScanFlags(state) {
  const rest = { ...(state || {}) };
  delete rest.openScan;
  delete rest.openPhotoScan;
  delete rest.openMenuScan;
  return rest;
}

// Whether there is an earlier screen in this app to go back to; a scan page
// opened directly (a bookmark, a fresh launch) falls back to Food search.
export function canGoBack() {
  const idx = typeof window !== 'undefined' ? window.history.state?.idx : 0;
  return Number.isFinite(idx) && idx > 0;
}
