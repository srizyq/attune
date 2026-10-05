import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { readImportFiles, MAX_CSV_BYTES, MAX_FILES } from './readFiles';

const csvFile = (name, text) => new File([text], name, { type: 'text/csv' });
const zipFile = (name, entries) => new File([zipSync(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])))], name, { type: 'application/zip' });

describe('readImportFiles', () => {
  it('reads plain CSV files', async () => {
    const { files, problems } = await readImportFiles([csvFile('diary.csv', 'a,b\n1,2')]);
    expect(files).toEqual([{ name: 'diary.csv', text: 'a,b\n1,2' }]);
    expect(problems).toEqual([]);
  });

  it('opens a zip and returns the CSVs inside, by base name', async () => {
    const { files } = await readImportFiles([zipFile('export.zip', { 'MyFitnessPal/Food Diary.csv': 'Date,Calories\n2026-03-05,100', 'MyFitnessPal/Weight.csv': 'Date,Weight\n2026-03-05,80' })]);
    expect(files.map((f) => f.name).sort()).toEqual(['Food Diary.csv', 'Weight.csv']);
    expect(files.find((f) => f.name === 'Weight.csv').text).toBe('Date,Weight\n2026-03-05,80');
  });

  it('ignores non-CSV entries and macOS junk inside a zip', async () => {
    const { files } = await readImportFiles([zipFile('e.zip', { 'a.csv': 'x', 'readme.pdf': 'pdf', '__MACOSX/._a.csv': 'junk', '.DS_Store': 'x', 'sub/._b.csv': 'junk' })]);
    expect(files.map((f) => f.name)).toEqual(['a.csv']);
  });

  it('says so when a zip has no CSVs, or is not a zip at all', async () => {
    expect((await readImportFiles([zipFile('e.zip', { 'photo.jpg': 'x' })])).problems[0]).toMatch(/no CSV files/);
    expect((await readImportFiles([new File(['not a zip'], 'bad.zip')])).problems[0]).toMatch(/couldn't be opened/);
  });

  it('skips unsupported file types without failing the rest', async () => {
    const { files, problems } = await readImportFiles([csvFile('a.csv', 'x'), new File(['x'], 'photo.png'), new File(['x'], 'sheet.xlsx')]);
    expect(files).toHaveLength(1);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/photo\.png isn't a CSV or zip/);
  });

  it('refuses an oversize CSV, and never inflates an oversize zip entry', async () => {
    const big = new File([new Uint8Array(MAX_CSV_BYTES + 1)], 'huge.csv');
    expect((await readImportFiles([big])).problems[0]).toMatch(/too large/);
    const zip = zipFile('z.zip', { 'huge.csv': new Uint8Array(MAX_CSV_BYTES + 10), 'ok.csv': 'a,b' });
    const { files } = await readImportFiles([zip]);
    expect(files.map((f) => f.name)).toEqual(['ok.csv']);
    expect((await readImportFiles([zip])).problems[0]).toMatch(/huge\.csv \(in z\.zip\) is too large/);
  });

  it('caps how many files it reads', async () => {
    const many = Array.from({ length: MAX_FILES + 3 }, (_, i) => csvFile(`f${i}.csv`, 'x'));
    const { files, problems } = await readImportFiles(many);
    expect(files).toHaveLength(MAX_FILES);
    expect(problems.filter((p) => /first 40 files/.test(p))).toHaveLength(1);
  });

  it('handles no files', async () => {
    expect(await readImportFiles([])).toEqual({ files: [], problems: [] });
    expect(await readImportFiles(null)).toEqual({ files: [], problems: [] });
  });
});
