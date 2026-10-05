import { test, expect } from '@playwright/test';
import { zipSync, strToU8 } from 'fflate';
import { Buffer } from 'node:buffer';
import { openApp, settle } from './harness.js';
import { daysAgo, ymd } from './fixtures.js';

// The import flow in a real browser: pick a file → see what was understood →
// import. SYNTHETIC files, shaped like the apps' documented exports (no real
// export was available) — see src/lib/importers/diary.test.js.

const OLD_A = '2025-01-10';
const OLD_B = '2025-01-11';
const HAS_FOOD = ymd(daysAgo(1)); // the fixture account has food logged on this day

const DIARY = [
  'Date,Meal,Food Name,Calories,Fat (g),Carbohydrates (g),Protein (g),Fiber',
  `${OLD_A},Breakfast,Oats,150,3,27,5,4`,
  `${OLD_A},Lunch,Chicken salad,420,18,12,45,3`,
  `${OLD_B},Dinner,Pasta,780,24,92,38,6`,
  `${HAS_FOOD},Snacks,Apple,95,0.3,25,0.5,4`,
  ',Lunch,No date,100,1,1,1,0',
].join('\n');
const WEIGHT = 'Date,Weight (kg)\n2025-01-10,80.5\n2025-01-11,80.1';

async function openImport(page) {
  await page.goto('/settings');
  await settle(page);
  await page.getByRole('button', { name: /Privacy/ }).first().click();
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByText('Bring your history with you')).toBeVisible();
}
const upload = (page, files) => page.getByTestId('import-file-input').setInputFiles(files);
const csv = (name, text) => ({ name, mimeType: 'text/csv', buffer: Buffer.from(text) });

function recordWrites(page, table) {
  const writes = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && new URL(req.url()).pathname.endsWith(`/rest/v1/${table}`)) {
      try { writes.push(JSON.parse(req.postData() || '[]')); } catch { /* ignore */ }
    }
  });
  return writes;
}

test.describe('import from another app', () => {
  test('Privacy → Import opens the importer', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await openImport(page);
    await expect(page.getByRole('button', { name: 'Choose file or zip' })).toBeVisible();
  });

  test('shows what it found, skips days already logged, and imports the rest', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const foodWrites = recordWrites(page, 'food_logs');
    const weightWrites = recordWrites(page, 'weight_logs');
    await openImport(page);
    await upload(page, [csv('Food Diary.csv', DIARY), csv('Weight.csv', WEIGHT)]);

    await expect(page.getByText('What we found')).toBeVisible();
    await expect(page.getByText('4 food entries across 3 days')).toBeVisible();
    await expect(page.getByText('2 weigh-ins', { exact: true })).toBeVisible();
    await expect(page.getByText(/MyFitnessPal, 4 rows/)).toBeVisible();
    await expect(page.getByText('1 row: no date')).toBeVisible();
    await expect(page.getByText(/1 day will be left alone/)).toBeVisible();

    await page.getByRole('button', { name: 'Import 3 entries and 2 weigh-ins' }).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    await expect(page.getByText('3 food entries added across 2 days')).toBeVisible();
    await expect(page.getByText(/1 day left alone/)).toBeVisible();

    const rows = foodWrites.flat();
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.source === 'import' && r.logged_unit === 'serving' && r.logged_amount === 1)).toBe(true);
    expect(rows.map((r) => r.food_name).sort()).toEqual(['Chicken salad', 'Oats', 'Pasta']);
    expect(rows.find((r) => r.food_name === 'Oats')).toMatchObject({ logged_date: OLD_A, meal: 'breakfast', calories: 150, protein_g: 5, carbs_g: 27, fat_g: 3, fibre_g: 4 });
    expect(weightWrites.flat().map((w) => [w.logged_date, w.weight, w.unit])).toEqual([[OLD_A, 80.5, 'kg'], [OLD_B, 80.1, 'kg']]);
  });

  test('turning off "skip days" imports those days too, with a warning', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const foodWrites = recordWrites(page, 'food_logs');
    await openImport(page);
    await upload(page, [csv('Food Diary.csv', DIARY)]);
    await expect(page.getByText(/1 day will be left alone/)).toBeVisible();
    await page.getByRole('checkbox', { name: /Skip days that already have food/ }).uncheck();
    await expect(page.getByText(/could end up doubled/)).toBeVisible();
    await page.getByRole('button', { name: 'Import 4 entries' }).click();
    await expect(page.getByText('Import complete')).toBeVisible();
    expect(foodWrites.flat()).toHaveLength(4);
  });

  test('reads a zip of CSVs', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    const zip = zipSync({ 'export/Food Diary.csv': strToU8(DIARY), 'export/Weight.csv': strToU8(WEIGHT), '__MACOSX/export/._Food Diary.csv': strToU8('junk') });
    await openImport(page);
    await upload(page, [{ name: 'myfitnesspal-export.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) }]);
    await expect(page.getByText('4 food entries across 3 days')).toBeVisible();
    await expect(page.getByText('2 weigh-ins', { exact: true })).toBeVisible();
  });

  test('asks which way round dates go when it cannot tell, and re-reads when told', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await openImport(page);
    await upload(page, [csv('d.csv', 'Date,Food,Calories\n05/03/2025,Toast,100\n06/03/2025,Eggs,150')]);
    await expect(page.getByText(/could be read two ways/)).toBeVisible();
    await expect(page.getByText('5 Mar 2025 – 6 Mar 2025')).toBeVisible();
    await page.getByLabel('Date order').selectOption('mdy');
    await expect(page.getByText(/3 May 2025 – 3 Jun/)).toBeVisible();
  });

  test('says so, and offers another go, when the file has nothing importable', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await openImport(page);
    await upload(page, [csv('notes.csv', 'Title,Body\nHello,World')]);
    await expect(page.getByText(/Nothing we could import/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Import/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Choose different files' }).click();
    await expect(page.getByText('Bring your history with you')).toBeVisible();
  });

  test('refuses a file type it cannot read, without leaving the first screen', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await openImport(page);
    await upload(page, [{ name: 'diary.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') }]);
    await expect(page.getByRole('alert')).toContainText("diary.pdf isn't a CSV or zip");
    await expect(page.getByRole('button', { name: 'Choose file or zip' })).toBeVisible();
  });

  test('a failed save stops, explains, and keeps what was saved', async ({ page, context }, testInfo) => {
    await openApp({ page, context }, testInfo);
    await openImport(page);
    await upload(page, [csv('Food Diary.csv', DIARY)]);
    await expect(page.getByText(/1 day will be left alone/)).toBeVisible();
    await context.route('**/rest/v1/food_logs*', (route) => route.request().method() === 'POST'
      ? route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ code: '42501', message: 'new row violates row-level security policy' }) })
      : route.fallback());
    await page.getByRole('button', { name: /^Import 3 entries/ }).click();
    await expect(page.getByText('Import stopped')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('row-level security');
    await expect(page.getByRole('button', { name: 'Choose files again' })).toBeVisible();
  });
});
