// Pulled out of App.jsx's AnimatedRoutes specifically so the bug it once
// had — a same-route re-navigation (new location.state, same pathname:
// a calendar day click, a re-opened scan modal) silently getting
// dropped, because the rendered location only advanced on pathname
// changes — has an automated test tied to the real decision logic,
// not a hand-verified click in the app that has to be redone by hand
// every time this code is touched.
//
// react-router hands AnimatedRoutes a brand-new `location` object on
// every navigation, including ones that don't change the pathname — so
// "does this navigation need handling at all" is really "is this a
// different object than what's currently rendered", not a pathname
// comparison.
export function locationChanged(nextLocation, renderedLocation) {
  return nextLocation !== renderedLocation;
}

// A real page transition (deserving the slide/fade animation and a
// route-level remount) only happens when the pathname itself changes.
// A same-route re-navigation must still update the rendered location
// (see locationChanged above) but should do so instantly, with no
// animation — it isn't a page change, just fresh state on the page
// that's already showing.
export function isPageTransition(nextLocation, renderedLocation) {
  return nextLocation.pathname !== renderedLocation.pathname;
}
