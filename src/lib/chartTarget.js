// Segments for the calorie chart's target line. The user's own target draws
// as one continuous line across every day; a day with burned calories breaks
// out of it as its own raised segment (target + burned) with no connector to
// its neighbours, and the base line is interrupted under it. A day may carry
// its own `baseTarget` (a rest day with different targets); the line then
// steps to that day's value, as its own segment, instead of running through.
//
// Returns [{ start, end, value }] where start/end are inclusive day indices.
export function targetLineSegments(days, baseTarget) {
  const segments = [];
  let runStart = null;
  let runValue = null;
  const flush = end => {
    if (runStart !== null) segments.push({ start: runStart, end, value: runValue });
    runStart = null;
    runValue = null;
  };
  days.forEach((d, i) => {
    const burned = Number(d.caloriesBurned) || 0;
    const base = Number.isFinite(Number(d.baseTarget)) && d.baseTarget !== null && d.baseTarget !== undefined ? Number(d.baseTarget) : baseTarget;
    if (burned > 0) {
      flush(i - 1);
      segments.push({ start: i, end: i, value: base + burned });
    } else if (runStart !== null && runValue !== base) {
      flush(i - 1);
      runStart = i;
      runValue = base;
    } else if (runStart === null) {
      runStart = i;
      runValue = base;
    }
  });
  flush(days.length - 1);
  return segments;
}
