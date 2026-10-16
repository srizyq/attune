// The address to put in links people send to others. Anyone who opened the app
// on one of Vercel's own addresses (attune-xyz.vercel.app) would otherwise hand
// out that address, which is long, unfamiliar and not where the app lives.
// localhost stays as it is so development and tests still work.
export const PUBLIC_ORIGIN = 'https://attun3.com';

export function shareOrigin(origin = window.location.origin) {
  try {
    return new URL(origin).hostname.endsWith('.vercel.app') ? PUBLIC_ORIGIN : origin;
  } catch {
    return PUBLIC_ORIGIN;
  }
}
