// Segments for the calorie chart's target line. The user's own target draws
// as one continuous line across every day; a day with burned calories breaks
// out of it as its own raised segment (target + burned) with no connector to
// its neighbours, and the base line is interrupted under it.
//
// Returns [{ start, end, value }] where start/end are inclusive day indices.
export function targetLineSegments(days, baseTarget) {
  const segments = [];
  let runStart = null;
  const flush = end => {
    if (runStart !== null) segments.push({ start: runStart, end, value: baseTarget });
    runStart = null;
  };
  days.forEach((d, i) => {
    const burned = Number(d.caloriesBurned) || 0;
    if (burned > 0) {
      flush(i - 1);
      segments.push({ start: i, end: i, value: baseTarget + burned });
    } else if (runStart === null) {
      runStart = i;
    }
  });
  flush(days.length - 1);
  return segments;
}
