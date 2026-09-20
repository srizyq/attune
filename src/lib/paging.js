// PostgREST caps a single response at 1,000 rows by default, and it does so
// silently — a 90-day food log for someone who logs 12 items a day is 1,080
// rows, and the last 80 would just vanish from every chart and average
// computed from it. `selectAll` pages through with .range() until a page
// comes back short. `build` must return a *fresh* query each call (a
// supabase-js builder is single-use) and should be ordered by something
// unique-ish (end with `id`) so rows can't be duplicated or skipped across
// page boundaries.
export const PAGE_SIZE = 1000;
const MAX_PAGES = 200; // 200k rows: a runaway-loop guard, not a real limit

export async function selectAll(build, pageSize = PAGE_SIZE) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize;
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
