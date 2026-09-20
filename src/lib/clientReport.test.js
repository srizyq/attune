import { describe, it, expect } from 'vitest';
import {
  buildReport, buildCsv, buildReportHtml, csvCell, reportFilename, validateRange, datesInRange,
  MICRO_COLUMNS, MAX_REPORT_DAYS, COMPLETE_DAY_MEALS,
} from './clientReport.js';
import { MICRO_NUTRIENTS } from './microNutrients.js';

const client = { name: 'Sam Client', goal: 'lose', calorie_target: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, unit: 'metric' };
const log = (date, meal, calories, extra = {}) => ({ logged_date: date, meal, calories, protein_g: 10, carbs_g: 20, fat_g: 5, ...extra });
const base = { client, start: '2026-09-14', end: '2026-09-20' };

describe('validateRange / datesInRange', () => {
  it('accepts a normal range and describes the problems otherwise', () => {
    expect(validateRange('2026-09-01', '2026-09-30')).toBeNull();
    expect(validateRange('2026-09-01', '2026-09-01')).toBeNull();
    expect(validateRange('2026-09-30', '2026-09-01')).toMatch(/before the start/);
    expect(validateRange('', '2026-09-01')).toMatch(/Choose a start/);
    expect(validateRange('2026-9-1', '2026-09-30')).toMatch(/Choose a start/);
    expect(validateRange('2025-01-01', '2026-09-01')).toMatch(new RegExp(`${MAX_REPORT_DAYS} days or fewer`));
  });
  it('allows exactly the maximum and no more', () => {
    expect(validateRange('2026-01-01', '2026-12-31')).toBeNull(); // 365 days
    expect(validateRange('2024-01-01', '2024-12-31')).toBeNull(); // 366 days (leap year)
    expect(validateRange('2024-01-01', '2025-01-01')).not.toBeNull(); // 367
  });
  it('lists every date inclusive, across a month boundary and a daylight-saving change', () => {
    expect(datesInRange('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
    expect(datesInRange('2026-10-03', '2026-10-05')).toHaveLength(3);
    expect(datesInRange('2026-09-20', '2026-09-20')).toEqual(['2026-09-20']);
  });
  it('buildReport refuses a bad range instead of producing nonsense', () => {
    expect(() => buildReport({ ...base, start: '2026-09-20', end: '2026-09-14' })).toThrow(RangeError);
  });
});

describe('buildReport — days', () => {
  const foodLogs = [
    log('2026-09-14', 'breakfast', 500), log('2026-09-14', 'lunch', 700), log('2026-09-14', 'dinner', 800),
    log('2026-09-15', 'lunch', 1900),
    log('2026-09-16', 'breakfast', 300), log('2026-09-16', 'lunch', 300), log('2026-09-16', 'snacks', 300),
    log('2026-09-01', 'lunch', 9999), // outside the range: ignored
  ];
  const r = buildReport({ ...base, foodLogs });

  it('has one row per calendar day in range, with empty days included', () => {
    expect(r.days.map((d) => d.date)).toEqual(datesInRange('2026-09-14', '2026-09-20'));
    expect(r.days.find((d) => d.date === '2026-09-17')).toMatchObject({ calories: 0, logged: false, complete: false, meals: 0 });
  });
  it('sums the day and ignores rows outside the range', () => {
    expect(r.days[0]).toMatchObject({ date: '2026-09-14', calories: 2000, protein: 30, items: 3, meals: 3 });
    expect(r.days.some((d) => d.calories === 9999)).toBe(false);
  });
  it('defines a complete day as 3+ distinct meal slots — not 3 items', () => {
    expect(COMPLETE_DAY_MEALS).toBe(3);
    expect(r.days[0].complete).toBe(true);
    expect(r.days[1].complete).toBe(false);
    const manyItemsOneMeal = buildReport({ ...base, foodLogs: Array.from({ length: 6 }, () => log('2026-09-14', 'lunch', 100)) });
    expect(manyItemsOneMeal.days[0]).toMatchObject({ items: 6, meals: 1, complete: false });
  });
  it('files an unrecognised meal name under snacks rather than dropping it', () => {
    const odd = buildReport({ ...base, foodLogs: [log('2026-09-14', 'brunch', 100), log('2026-09-14', 'snacks', 100)] });
    expect(odd.days[0].meals).toBe(1);
  });
});

describe('buildReport — day filters and averages', () => {
  const foodLogs = [
    log('2026-09-14', 'breakfast', 500), log('2026-09-14', 'lunch', 700), log('2026-09-14', 'dinner', 800), // 2000, complete
    log('2026-09-15', 'lunch', 1000),                                                                        // 1000, logged only
  ];
  it('"all" averages over every day, counting empty ones as zero', () => {
    const r = buildReport({ ...base, foodLogs, dayFilter: 'all' });
    expect(r.summary.includedDays).toBe(7);
    expect(r.summary.avgCalories).toBe(Math.round(3000 / 7));
  });
  it('"logged" averages only over days with food', () => {
    const r = buildReport({ ...base, foodLogs, dayFilter: 'logged' });
    expect(r.summary.includedDays).toBe(2);
    expect(r.summary.avgCalories).toBe(1500);
    expect(r.included.map((d) => d.date)).toEqual(['2026-09-14', '2026-09-15']);
  });
  it('"complete" averages only over complete days', () => {
    const r = buildReport({ ...base, foodLogs, dayFilter: 'complete' });
    expect(r.summary.includedDays).toBe(1);
    expect(r.summary.avgCalories).toBe(2000);
  });
  it('an unknown filter falls back to all days; a filter that matches nothing gives zeros, not NaN', () => {
    expect(buildReport({ ...base, foodLogs, dayFilter: 'bogus' }).summary.includedDays).toBe(7);
    const none = buildReport({ ...base, foodLogs: [], dayFilter: 'complete' });
    expect(none.summary).toMatchObject({ includedDays: 0, avgCalories: 0, avgProtein: 0, daysOnTarget: 0, avgEnergy: null });
    expect(none.included).toEqual([]);
  });
  it('counts days within 10% of target among logged days only, and reports "n/a" with no target', () => {
    const r = buildReport({ ...base, foodLogs: [log('2026-09-14', 'lunch', 2100), log('2026-09-15', 'lunch', 2300), log('2026-09-16', 'lunch', 1700)], dayFilter: 'logged' });
    expect(r.summary).toMatchObject({ daysOnTarget: 1, daysEvaluatedForTarget: 3 });
    const noTarget = buildReport({ ...base, client: { ...client, calorie_target: null }, foodLogs: [log('2026-09-14', 'lunch', 2100)] });
    expect(noTarget.summary.daysOnTarget).toBeNull();
    expect(noTarget.summary.daysEvaluatedForTarget).toBe(0);
  });
});

describe('buildReport — weight, energy, workouts, micros', () => {
  it('reports weight first -> last in the client\'s own unit, converting mixed entries', () => {
    const w = buildReport({ ...base, weightLogs: [{ logged_date: '2026-09-20', weight: 176.4, unit: 'lb' }, { logged_date: '2026-09-14', weight: 82, unit: 'kg' }] }).summary.weight;
    expect(w).toMatchObject({ first: 82, unit: 'kg', entries: 2 });
    expect(w.last).toBeCloseTo(80, 0);
    expect(w.change).toBeCloseTo(-2, 0);
    const imp = buildReport({ ...base, client: { ...client, unit: 'imperial' }, weightLogs: [{ logged_date: '2026-09-14', weight: 180, unit: 'lb' }] }).summary.weight;
    expect(imp).toMatchObject({ first: 180, last: 180, change: 0, unit: 'lb' });
    expect(buildReport(base).summary.weight).toBeNull();
  });
  it('averages energy over included days that have a check-in', () => {
    const r = buildReport({ ...base, checkins: [{ checkin_date: '2026-09-14', energy: 6, mood: 'good' }, { checkin_date: '2026-09-15', energy: 9 }, { checkin_date: '2026-09-15', energy: null }] });
    expect(r.summary.avgEnergy).toBe(7.5);
  });
  it('totals the workouts it is given', () => {
    const r = buildReport({ ...base, workouts: [{ duration_minutes: 30, calories_burned: 300 }, { duration_minutes: '45', calories_burned: '400' }] });
    expect(r.summary.workouts).toEqual({ sessions: 2, minutes: 75, calories: 700 });
  });
  it('averages micronutrients per included day, only when asked', () => {
    const foodLogs = [log('2026-09-14', 'lunch', 100, { fibre_g: 10, sodium_mg: 1000, vitamin_d_mcg: 6 }), log('2026-09-15', 'lunch', 100, { fibre_g: 4 })];
    expect(buildReport({ ...base, foodLogs }).micros).toBeNull();
    const m = buildReport({ ...base, foodLogs, dayFilter: 'logged', includeMicros: true }).micros;
    expect(m.find((n) => n.key === 'fibre')).toMatchObject({ avg: 7, unit: 'g' });
    expect(m.find((n) => n.key === 'sodium').avg).toBe(500);
    expect(m.find((n) => n.key === 'vitaminD').avg).toBe(3);
    expect(m).toHaveLength(MICRO_NUTRIENTS.length);
  });
  it('keeps two decimals for the small extended nutrients, and treats a food without data as adding nothing', () => {
    const foodLogs = [log('2026-09-14', 'lunch', 100, { thiamin_mg: 0.4 }), log('2026-09-14', 'dinner', 100, { thiamin_mg: null, caffeine_mg: 95 }), log('2026-09-15', 'lunch', 100, { thiamin_mg: 0.05 })];
    const m = buildReport({ ...base, foodLogs, dayFilter: 'logged', includeMicros: true }).micros;
    expect(m.find((n) => n.key === 'thiamin')).toMatchObject({ avg: 0.23, extended: true }); // (0.4 + 0.05) / 2 days
    expect(m.find((n) => n.key === 'caffeine').avg).toBe(47.5);
    expect(m.find((n) => n.key === 'fibre').extended).toBe(false);
  });
  it('flags extended nutrients in the CSV columns and the printed report as a minimum', () => {
    const report = buildReport({ ...base, foodLogs: [log('2026-09-14', 'lunch', 100, { thiamin_mg: 0.4 })], dayFilter: 'logged', includeMicros: true });
    expect(buildCsv(report)).toContain('Thiamin (B1) (mg)');
    expect(buildCsv(report)).toContain(',0.4');
    const html = buildReportHtml(report);
    expect(html).toContain('Thiamin (B1) †');
    expect(html).toMatch(/marked †.*minimum/);
    const without = buildReportHtml(buildReport({ ...base, foodLogs: [log('2026-09-14', 'lunch', 100)], dayFilter: 'logged' }));
    expect(without).not.toContain('†');
  });
  it('maps every micronutrient to a food_logs column (add a nutrient => add its column)', () => {
    for (const n of MICRO_NUTRIENTS) expect(MICRO_COLUMNS[n.key], n.key).toMatch(/^[a-z0-9_]+_(g|mg|mcg)$/);
    expect(Object.keys(MICRO_COLUMNS).sort()).toEqual(MICRO_NUTRIENTS.map((n) => n.key).sort());
  });
});

describe('buildReport — data sources', () => {
  const foodLogs = [
    log('2026-09-14', 'lunch', 700, { source: 'ausnut' }),
    log('2026-09-14', 'dinner', 300, { source: 'photo' }),
    log('2026-09-15', 'lunch', 1000, { source: 'photo' }), // a day the filter excludes below
  ];
  it('reports where the included days\' calories came from', () => {
    const r = buildReport({ ...base, foodLogs, dayFilter: 'all' });
    expect(r.summary.sources.map((x) => [x.key, x.pct])).toEqual([['ai', 65], ['verified', 35]]);
  });
  it('counts only the days that pass the filter, like every other average', () => {
    // 09-14 has three meal slots (complete); 09-15's 1,000 AI calories are on an
    // incomplete day and must not drag the mix towards "AI estimate".
    const r = buildReport({ ...base, foodLogs: foodLogs.concat(log('2026-09-14', 'breakfast', 0, { source: 'photo' })), dayFilter: 'complete' });
    expect(r.summary.sources.map((x) => [x.key, x.pct])).toEqual([['verified', 70], ['ai', 30]]);
  });
  it('is empty when nothing was logged, and printed in the document', () => {
    expect(buildReport({ ...base }).summary.sources).toEqual([]);
    const html = buildReportHtml(buildReport({ ...base, foodLogs }));
    expect(html).toContain('Data sources (by calories)');
    expect(html).toContain('65% ai estimate · 35% verified');
    expect(buildReportHtml(buildReport({ ...base }))).toContain('<span>Data sources (by calories)</span><strong>—</strong>');
  });
});

describe('csvCell', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('plain')).toBe('plain');
  });
  it('defuses spreadsheet formula injection in text, but leaves numbers alone', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    for (const t of ['+1', '-1', '@SUM(A1)', '\tx']) expect(csvCell(t).startsWith("'") || csvCell(t).startsWith('"\'')).toBe(true);
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(0)).toBe('0');
  });
  it('writes null/undefined/NaN as empty', () => {
    expect([csvCell(null), csvCell(undefined), csvCell(NaN)]).toEqual(['', '', '']);
  });
});

describe('buildCsv', () => {
  const r = buildReport({ ...base, dayFilter: 'logged', includeMicros: true, foodLogs: [log('2026-09-14', 'lunch', 750.4, { fibre_g: 3.14159 })], checkins: [{ checkin_date: '2026-09-14', mood: 'good', energy: 7, water_glasses: 5 }] });
  const csv = buildCsv(r);
  const lines = csv.replace(/^\ufeff/, '').split('\r\n');

  it('starts with a BOM and uses CRLF line endings with a trailing newline', () => {
    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(lines.at(-1)).toBe('');
  });
  it('has a header, then one row per included day only', () => {
    expect(lines[0].startsWith('Date,Calories,Protein (g),Carbs (g),Fat (g),Fibre (g),Meals logged,Complete day,Mood,Energy,Water (glasses),Fibre (g),')).toBe(true);
    expect(lines).toHaveLength(3); // header + 1 day + trailing ''
    expect(lines[1].startsWith('2026-09-14,750,10,20,5,3.1,1,no,good,7,5,3.1,')).toBe(true);
  });
  it('has the same number of columns in every row', () => {
    const cols = (l) => l.split(',').length;
    expect(cols(lines[1])).toBe(cols(lines[0]));
  });
  it('omits micronutrient columns when not requested', () => {
    const plain = buildCsv(buildReport({ ...base, foodLogs: [] })).split('\r\n')[0];
    expect(plain.split(',')).toHaveLength(11);
  });
});

describe('reportFilename', () => {
  it('is a safe ascii slug', () => {
    expect(reportFilename({ meta: { clientName: 'Sam Client', start: '2026-09-14', end: '2026-09-20' } }, 'csv')).toBe('attune-sam-client-2026-09-14-to-2026-09-20.csv');
    expect(reportFilename({ meta: { clientName: 'José "The Rock" <b>', start: 'a', end: 'b' } }, 'pdf')).toBe('attune-jose-the-rock-b-a-to-b.pdf');
    expect(reportFilename({ meta: { clientName: '   ', start: 'a', end: 'b' } }, 'csv')).toBe('attune-client-a-to-b.csv');
  });
});

describe('buildReportHtml', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const r = buildReport({ ...base, client: { ...client, name: evil }, dayFilter: 'all', includeMicros: true, foodLogs: [log('2026-09-14', 'lunch', 2000)], weightLogs: [{ logged_date: '2026-09-14', weight: 80, unit: 'kg' }] });
  const html = buildReportHtml(r, { generatedOn: '20/09/2026' });

  it('escapes everything user-supplied', () => {
    expect(html).not.toContain(evil);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
  it('states the range, filter and definitions a reader needs to interpret the numbers', () => {
    expect(html).toContain('All days');
    expect(html).toContain('20/09/2026');
    expect(html).toContain('3 or more of the 4 meals');
    expect(html).toContain('count as zero');
    expect(html).toContain('Average daily micronutrients');
  });
  it('says so when the filter leaves no days', () => {
    expect(buildReportHtml(buildReport({ ...base, dayFilter: 'complete' }))).toContain('No days match this filter.');
  });
  it('is a complete document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html.trim().endsWith('</html>')).toBe(true);
  });
});
