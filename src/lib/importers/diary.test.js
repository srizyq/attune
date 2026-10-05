import { describe, it, expect } from 'vitest';
import { headerInfo, parseNumber, parseDate, mapMeal, parseImportFiles } from './diary';

// NOTE: every sample file below is SYNTHETIC — built from the column names the
// apps are documented to use, not from a real export (none was available). They
// pin down how this importer reads such files; they can't prove a real export
// from each app parses until one is tried.
const TODAY = '2026-10-05';
const run = (files, opts = {}) => parseImportFiles(files, { today: TODAY, defaultWeightUnit: 'kg', ...opts });

describe('headerInfo', () => {
  it('splits the unit from the name and normalises the key', () => {
    expect(headerInfo('Carbohydrates (g)')).toEqual({ key: 'carbohydrates', unit: 'g' });
    expect(headerInfo('Energy (kcal)')).toEqual({ key: 'energy', unit: 'kcal' });
    expect(headerInfo('Vitamin B12 (µg)')).toEqual({ key: 'vitaminb12', unit: 'ug' });
    expect(headerInfo('Food Name')).toEqual({ key: 'foodname', unit: null });
  });
});

describe('parseNumber', () => {
  it('reads plain, thousands-separated and decimal-comma numbers', () => {
    expect(parseNumber('120')).toBe(120);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('12,5')).toBe(12.5);
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('  7.25 g ')).toBe(7.25);
    expect(parseNumber('-3')).toBe(-3);
  });
  it('returns null for blanks and placeholders', () => {
    for (const v of ['', ' ', '-', '—', 'n/a', 'N/A', 'null', null, undefined, 'abc']) expect(parseNumber(v)).toBeNull();
  });
});

describe('parseDate', () => {
  it('reads ISO dates, with or without a time', () => {
    expect(parseDate('2026-03-05').date).toBe('2026-03-05');
    expect(parseDate('2026-03-05T08:30:00Z').date).toBe('2026-03-05');
    expect(parseDate('2026/3/5').date).toBe('2026-03-05');
  });
  it('knows day/month when one part is over 12, whatever the preferred order', () => {
    expect(parseDate('25/03/2026', 'mdy')).toEqual({ date: '2026-03-25', ambiguous: false });
    expect(parseDate('03/25/2026', 'dmy')).toEqual({ date: '2026-03-25', ambiguous: false });
  });
  it('uses the preferred order, and flags it, when both readings work', () => {
    expect(parseDate('05/03/2026', 'dmy')).toEqual({ date: '2026-03-05', ambiguous: true });
    expect(parseDate('05/03/2026', 'mdy')).toEqual({ date: '2026-05-03', ambiguous: true });
    expect(parseDate('05/05/2026', 'dmy').ambiguous).toBe(false); // same either way
  });
  it('reads two-digit years and month names', () => {
    expect(parseDate('5/3/26', 'dmy').date).toBe('2026-03-05');
    expect(parseDate('5 Mar 2026').date).toBe('2026-03-05');
    expect(parseDate('March 5, 2026').date).toBe('2026-03-05');
    expect(parseDate('Mar 5th 2026').date).toBe('2026-03-05');
  });
  it('rejects impossible and unreadable dates', () => {
    for (const v of ['2026-02-30', '31/02/2026', '2026-13-01', 'yesterday', '', '12:30', '1850-01-01']) expect(parseDate(v).date).toBeNull();
  });
});

describe('mapMeal', () => {
  it('maps meal names, and falls back to time of day then snacks', () => {
    expect(mapMeal('Breakfast')).toBe('breakfast');
    expect(mapMeal('LUNCH')).toBe('lunch');
    expect(mapMeal('Brunch')).toBe('lunch');
    expect(mapMeal('Dinner')).toBe('dinner');
    expect(mapMeal('Supper')).toBe('dinner');
    expect(mapMeal('Snacks')).toBe('snacks');
    expect(mapMeal('Snack')).toBe('snacks');
    expect(mapMeal('Uncategorized')).toBe('snacks');
    expect(mapMeal('', '08:15')).toBe('breakfast');
    expect(mapMeal('', '12:30')).toBe('lunch');
    expect(mapMeal('', '19:00')).toBe('dinner');
    expect(mapMeal('', '22:30')).toBe('snacks');
    expect(mapMeal(null, null)).toBe('snacks');
  });
  it('trusts an explicit meal over the time', () => {
    expect(mapMeal('Dinner', '08:00')).toBe('dinner');
  });
});

const MFP_DIARY = [
  'Date,Meal,Food Name,Calories,Fat (g),Carbohydrates (g),Protein (g),Fiber,Sugar,Sodium (mg)',
  '2026-03-05,Breakfast,"Oats, rolled",150,3,27,5,4,1,2',
  '2026-03-05,Lunch,Chicken salad,420,18,12,45,3,4,610',
  '2026-03-05,Dinner,Pasta bolognese,780,24,92,38,6,11,900',
  '2026-03-06,Snacks,Apple,95,0.3,25,0.5,4.4,19,2',
].join('\n');

describe('MyFitnessPal-style diary', () => {
  const r = run([{ name: 'Food Diary.csv', text: MFP_DIARY }]);
  it('reads each row as an entry with its meal and macros', () => {
    expect(r.entries).toHaveLength(4);
    expect(r.entries[0]).toMatchObject({ loggedDate: '2026-03-05', meal: 'breakfast', name: 'Oats, rolled', cal: 150, protein: 5, carbs: 27, fat: 3, fibre: 4, sugar: 1, sodium: 2 });
    expect(r.entries[1].meal).toBe('lunch');
    expect(r.entries[3]).toMatchObject({ meal: 'snacks', fibre: 4.4 });
  });
  it('summarises the file, dates and days', () => {
    expect(r.files).toEqual([{ name: 'Food Diary.csv', kind: 'food', source: 'MyFitnessPal', rows: 4 }]);
    expect(r.firstDate).toBe('2026-03-05');
    expect(r.lastDate).toBe('2026-03-06');
    expect(r.days).toEqual(['2026-03-05', '2026-03-06']);
    expect(r.skipped).toEqual([]);
    expect(r.dateOrderGuessed).toBe(false);
  });
});

describe('a per-meal summary with no food names', () => {
  it('names each entry after its meal', () => {
    const r = run([{ name: 'Nutrition Summary.csv', text: 'Date,Meal,Calories,Fat (g),Carbohydrates (g),Protein (g)\n2026-03-05,Breakfast,400,10,50,20\n2026-03-05,Lunch,600,20,60,35' }]);
    expect(r.entries.map((e) => e.name)).toEqual(['Breakfast (imported)', 'Lunch (imported)']);
  });
  it('skips the Total rows such exports carry', () => {
    const r = run([{ name: 'a.csv', text: 'Date,Meal,Calories\n2026-03-05,Breakfast,400\n2026-03-05,Total,400\n2026-03-05,,1000' }]);
    expect(r.entries).toHaveLength(2); // the blank-meal row still has calories → snacks
    expect(r.skipped).toContainEqual({ reason: 'total rows', count: 1 });
  });
});

describe('Lose It-style diary', () => {
  const text = [
    'Date,Name,Type,Quantity,Units,Calories,Fat (g),Protein (g),Carbohydrates (g)',
    '2026-03-05,Greek yoghurt,Breakfast,2,Cup,260,6,24,18',
    '2026-03-05,Running,Exercise,30,Minutes,310,,,',
    '2026-03-05,Banana,Snacks,1,Each,105,0.4,1.3,27',
  ].join('\n');
  const r = run([{ name: 'export.csv', text }]);
  it('skips exercise rows and keeps food', () => {
    expect(r.entries.map((e) => e.name)).toEqual(['Greek yoghurt (2 Cup)', 'Banana']);
    expect(r.skipped).toContainEqual({ reason: 'exercise entries', count: 1 });
    expect(r.files[0].source).toBe('Lose It');
  });
  it('keeps the portion in the name unless it is just "1"', () => {
    expect(r.entries[1].name).toBe('Banana');
  });
});

describe('Cronometer-style servings', () => {
  const text = [
    'Day,Time,Group,Food Name,Amount,Category,Energy (kcal),Protein (g),Carbs (g),Fat (g),Fiber (g),Sodium (mg),Net Carbs (g)',
    '2026-03-05,07:45,Breakfast,Egg,2.00 large,Dairy and Egg Products,143,12.6,0.7,9.5,0,142,0.7',
    '2026-03-05,13:00,Lunch,Chicken breast,150 g,Poultry Products,248,46.5,0,5.4,0,111,0',
    '2026-03-05,20:00,Uncategorized,Dark chocolate,20 g,Sweets,120,1.6,9,8.6,2.2,3,6.8',
  ].join('\n');
  const r = run([{ name: 'servings.csv', text }]);
  it('reads Day / Group / Energy, and ignores the food Category as a meal', () => {
    // "Uncategorized" isn't a meal, so the 20:00 timestamp decides: dinner.
    expect(r.entries.map((e) => e.meal)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(r.entries[0]).toMatchObject({ cal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, sodium: 142 });
    expect(r.files[0].source).toBe('Cronometer');
  });
  it('uses the Carbs column, not Net Carbs', () => {
    expect(r.entries[2].carbs).toBe(9);
  });
  it('carries the amount into the name', () => {
    expect(r.entries[1].name).toBe('Chicken breast (150 g)');
  });
});

describe('daily totals only', () => {
  it('becomes one entry per day, labelled as a daily total', () => {
    const r = run([{ name: 'dailysummary.csv', text: 'Date,Energy (kcal),Protein (g),Carbs (g),Fat (g)\n2026-03-05,2100,150,220,70\n2026-03-06,1900,140,190,65' }]);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ name: 'Daily total (imported)', meal: 'snacks', cal: 2100 });
    expect(r.files[0].source).toBe('Daily totals');
  });
});

describe('weight files', () => {
  it('reads a Date / Weight file in the header\'s unit', () => {
    const r = run([{ name: 'Measurement Summary.csv', text: 'Date,Weight (lbs)\n2026-03-01,180.4\n2026-03-08,178.9' }]);
    expect(r.weights).toEqual([{ date: '2026-03-01', weight: 180.4, unit: 'lb' }, { date: '2026-03-08', weight: 178.9, unit: 'lb' }]);
    expect(r.entries).toEqual([]);
  });
  it('falls back to the account unit when the file does not say', () => {
    expect(run([{ name: 'w.csv', text: 'Date,Weight\n2026-03-01,80' }], { defaultWeightUnit: 'lb' }).weights[0].unit).toBe('lb');
    expect(run([{ name: 'w.csv', text: 'Date,Weight\n2026-03-01,80' }], { defaultWeightUnit: 'kg' }).weights[0].unit).toBe('kg');
  });
  it('reads a Metric / Unit / Amount (biometrics) file and keeps only weight', () => {
    const r = run([{ name: 'biometrics.csv', text: 'Day,Metric,Unit,Amount\n2026-03-01,Weight,kg,81.2\n2026-03-01,Blood Pressure,mmHg,120\n2026-03-02,Weight,kg,81.0' }]);
    expect(r.weights).toEqual([{ date: '2026-03-01', weight: 81.2, unit: 'kg' }, { date: '2026-03-02', weight: 81, unit: 'kg' }]);
    expect(r.skipped).toContainEqual({ reason: 'not a weight measurement', count: 1 });
  });
  it('keeps the last weigh-in when a date repeats, and drops implausible values', () => {
    const r = run([{ name: 'w.csv', text: 'Date,Weight (kg)\n2026-03-01,80\n2026-03-01,79.5\n2026-03-02,8\n2026-03-03,900' }]);
    expect(r.weights).toEqual([{ date: '2026-03-01', weight: 79.5, unit: 'kg' }]);
    expect(r.skipped).toContainEqual({ reason: 'weight outside a plausible range', count: 2 });
  });
});

describe('what gets skipped, and why', () => {
  const text = [
    'Date,Meal,Food Name,Calories,Protein (g)',
    ',Lunch,No date,300,10',
    'someday,Lunch,Bad date,300,10',
    '2030-01-01,Lunch,Far future,300,10',
    '2026-03-05,Lunch,Empty entry,0,0',
    '2026-03-05,Lunch,Absurd,99999,0',
    '2026-03-05,Lunch,Macros only,,30',
    '2026-03-05,Lunch,Fine,300,10',
  ].join('\n');
  const r = run([{ name: 'x.csv', text }]);
  it('keeps only the good rows', () => {
    expect(r.entries.map((e) => e.name)).toEqual(['Macros only', 'Fine']);
  });
  it('counts each reason', () => {
    expect(Object.fromEntries(r.skipped.map((s) => [s.reason, s.count]))).toEqual({
      'no date': 1, 'date not readable': 1, 'dates in the future': 1, 'no calories or macros': 1, 'calories outside a plausible range': 1,
    });
  });
  it('works out calories from macros when only macros are given', () => {
    expect(r.entries[0].cal).toBe(120); // 30 g protein × 4
  });
});

describe('units and conversions', () => {
  it('converts kJ to kcal', () => {
    expect(run([{ name: 'k.csv', text: 'Date,Food,Energy (kJ)\n2026-03-05,Toast,1046' }]).entries[0].cal).toBe(250);
  });
  it('reads sodium given in grams, and salt as ~40% sodium', () => {
    expect(run([{ name: 'a.csv', text: 'Date,Food,Calories,Sodium (g)\n2026-03-05,Toast,100,0.5' }]).entries[0].sodium).toBe(500);
    expect(run([{ name: 'a.csv', text: 'Date,Food,Calories,Salt (g)\n2026-03-05,Toast,100,1' }]).entries[0].sodium).toBe(400);
  });
  it('reads decimal commas in a semicolon file', () => {
    const r = run([{ name: 'a.csv', text: 'Date;Food;Calories;Protein (g)\n2026-03-05;Toast;"1.234,5";12,5' }]);
    expect(r.entries[0]).toMatchObject({ cal: 1235, protein: 12.5 });
  });
  it('never stores negative amounts', () => {
    const e = run([{ name: 'a.csv', text: 'Date,Food,Calories,Protein (g),Fibre (g),Sodium (mg)\n2026-03-05,Toast,100,-5,-2,-9' }]).entries[0];
    expect(e).toMatchObject({ protein: 0, fibre: 0, sodium: 0 });
  });
});

describe('day / month order', () => {
  const rows = (d1, d2) => `Date,Food,Calories\n${d1},A,100\n${d2},B,100`;
  it('is settled by any unambiguous date anywhere in the file set', () => {
    const r = run([{ name: 'a.csv', text: rows('05/03/2026', '25/03/2026') }]);
    expect(r.entries.map((e) => e.loggedDate)).toEqual(['2026-03-05', '2026-03-25']);
    expect(r.dateOrderGuessed).toBe(false);
    const us = run([{ name: 'a.csv', text: rows('05/03/2026', '03/25/2026') }]);
    expect(us.entries.map((e) => e.loggedDate)).toEqual(['2026-03-25', '2026-05-03']);
  });
  it('carries that across files', () => {
    const r = run([{ name: 'a.csv', text: rows('05/03/2026', '06/03/2026') }, { name: 'b.csv', text: rows('25/03/2026', '26/03/2026') }]);
    expect(r.days).toEqual(['2026-03-05', '2026-03-06', '2026-03-25', '2026-03-26']);
  });
  it('defaults to day/month and says it guessed when nothing settles it', () => {
    const r = run([{ name: 'a.csv', text: rows('05/03/2026', '06/03/2026') }]);
    expect(r.dateOrder).toBe('dmy');
    expect(r.dateOrderGuessed).toBe(true);
    expect(r.days).toEqual(['2026-03-05', '2026-03-06']);
  });
  it('honours an explicit choice', () => {
    const r = run([{ name: 'a.csv', text: rows('05/03/2026', '06/03/2026') }], { dateOrder: 'mdy' });
    expect(r.days).toEqual(['2026-03-05'.replace('03-05', '05-03'), '2026-06-03']);
    expect(r.dateOrderGuessed).toBe(false);
  });
});

describe('several files, and files that are not diaries', () => {
  it('combines a diary and a weight file, and notes files it ignores', () => {
    const r = run([
      { name: 'diary.csv', text: MFP_DIARY },
      { name: 'weight.csv', text: 'Date,Weight (kg)\n2026-03-05,80' },
      { name: 'exercise.csv', text: 'Date,Exercise,Minutes\n2026-03-05,Run,30' },
    ]);
    expect(r.entries).toHaveLength(4);
    expect(r.weights).toHaveLength(1);
    expect(r.files.map((f) => f.kind)).toEqual(['food', 'weight', 'ignored']);
  });
  it('handles an empty or header-only file', () => {
    const r = run([{ name: 'empty.csv', text: '' }, { name: 'h.csv', text: 'Date,Meal,Calories' }]);
    expect(r.entries).toEqual([]);
    expect(r.files.map((f) => f.kind)).toEqual(['ignored', 'food']);
    expect(r.firstDate).toBeNull();
  });
  it('sorts entries by date', () => {
    const r = run([{ name: 'a.csv', text: 'Date,Food,Calories\n2026-03-06,B,100\n2026-03-05,A,100' }]);
    expect(r.entries.map((e) => e.name)).toEqual(['A', 'B']);
  });
});
