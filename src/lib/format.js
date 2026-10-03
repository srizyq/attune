// A number rounded to at most 1 decimal place, without trailing zeros or
// floating-point noise (e.g. summed 7.1 + 7.1 showing as 14.200000000000001)
// leaking into the UI.
export function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

// A food's display name with its brand folded in, for the many spots that
// show only a plain name string (no separate subtitle line to put the brand
// on) — e.g. "Sanitarium Weet-Bix" rather than a bare "Weet-Bix".
export function withBrand(name, brand) {
  return brand ? `${brand} ${name}` : name;
}
