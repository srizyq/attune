// 'YYYY-MM-DD' -> whole calendar days between two such dates. Both are parsed
// as UTC midnight so a daylight-saving change between them can't make a day
// 23 or 25 hours long. NaN if either isn't a usable date.
export function daysBetween(fromIso, toIso) {
  const a = Date.parse(`${String(fromIso).slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${String(toIso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86400000);
}
