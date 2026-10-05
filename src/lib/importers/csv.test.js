import { describe, it, expect } from 'vitest';
import { parseCsv, parseCsvObjects } from './csv';

describe('parseCsv', () => {
  it('reads plain rows, and drops blank lines', () => {
    expect(parseCsv('a,b,c\n1,2,3\n\n4,5,6\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3'], ['4', '5', '6']]);
  });
  it('handles CRLF, lone CR and a missing final newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
    expect(parseCsv('a,b\r1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('strips a byte-order mark', () => {
    expect(parseCsv('﻿Date,Name\n2026-01-01,Egg')[0]).toEqual(['Date', 'Name']);
  });
  it('reads quoted fields with commas, escaped quotes and newlines', () => {
    expect(parseCsv('name,note\n"Chicken, grilled","said ""yum"""\n"two\nlines",x')).toEqual([
      ['name', 'note'], ['Chicken, grilled', 'said "yum"'], ['two\nlines', 'x'],
    ]);
  });
  it('keeps empty fields, including trailing ones, but drops a row that is entirely empty', () => {
    expect(parseCsv('a,,c,\n,,,')).toEqual([['a', '', 'c', '']]);
  });
  it('detects semicolons and tabs', () => {
    expect(parseCsv('Date;Food;Calories\n05/03/2026;Toast;120')).toEqual([['Date', 'Food', 'Calories'], ['05/03/2026', 'Toast', '120']]);
    expect(parseCsv('Date\tFood\n2026-03-05\tToast')).toEqual([['Date', 'Food'], ['2026-03-05', 'Toast']]);
  });
  it('does not mistake commas inside quoted decimals for the delimiter', () => {
    expect(parseCsv('Date;Calories\n2026-03-05;"1,234"')).toEqual([['Date', 'Calories'], ['2026-03-05', '1,234']]);
  });
  it('copes with empty and whitespace-only input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
    expect(parseCsv('\n\n  \n')).toEqual([]);
  });
  it('keeps an unterminated quote\'s text rather than losing the row', () => {
    expect(parseCsv('a,b\n1,"oops')).toEqual([['a', 'b'], ['1', 'oops']]);
  });
});

describe('parseCsvObjects', () => {
  it('keys each row by trimmed header and trims values', () => {
    const { headers, records } = parseCsvObjects(' Date , Food \n2026-03-05, Toast ');
    expect(headers).toEqual(['Date', 'Food']);
    expect(records).toEqual([{ Date: '2026-03-05', Food: 'Toast' }]);
  });
  it('pads short rows and ignores extra cells', () => {
    expect(parseCsvObjects('a,b,c\n1\n1,2,3,4').records).toEqual([{ a: '1', b: '', c: '' }, { a: '1', b: '2', c: '3' }]);
  });
  it('keeps the first of a repeated header', () => {
    expect(parseCsvObjects('x,x\n1,2').records).toEqual([{ x: '1' }]);
  });
  it('is empty for no input', () => {
    expect(parseCsvObjects('')).toEqual({ headers: [], records: [] });
  });
});
