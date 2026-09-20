import { describe, it, expect } from 'vitest';
import { KINDS, kindLabel, unitFor, unitSuffix, toBase, formatMeasurement, latestByKind, fitWithin, validateImageFile, MAX_INPUT_BYTES } from './bodyProgress.js';

const row = (kind, logged_date, value, unit = 'cm') => ({ kind, logged_date, value, unit });

describe('units', () => {
  it('lengths follow the profile, body fat is always a percentage', () => {
    expect(unitFor('waist', 'metric')).toBe('cm');
    expect(unitFor('waist', 'imperial')).toBe('in');
    expect(unitFor('waist', undefined)).toBe('cm');
    expect(unitFor('body_fat', 'imperial')).toBe('pct');
  });
  it('formats and converts', () => {
    expect(formatMeasurement(82.46, 'cm')).toBe('82.5 cm');
    expect(formatMeasurement(18.24, 'pct')).toBe('18.2%');
    expect(formatMeasurement('32', 'in')).toBe('32 in');
    expect(unitSuffix('pct')).toBe('%');
    expect(toBase(10, 'in')).toBeCloseTo(25.4);
    expect(toBase(10, 'cm')).toBe(10);
  });
  it('knows its kinds', () => {
    expect(KINDS.map((k) => k.id)).toEqual(['waist', 'hips', 'chest', 'arm', 'thigh', 'body_fat']);
    expect(kindLabel('body_fat')).toBe('Body fat');
    expect(kindLabel('mystery')).toBe('mystery');
  });
});

describe('latestByKind', () => {
  it('returns the newest value and the change from the one before, however the rows are ordered', () => {
    const r = latestByKind([row('waist', '2026-09-01', 84), row('waist', '2026-09-20', 82), row('waist', '2026-09-10', 83)]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kind: 'waist', delta: -1, entries: 3 });
    expect(r[0].latest.value).toBe(82);
    expect(r[0].previous.value).toBe(83);
  });
  it('has no delta with a single entry', () => {
    expect(latestByKind([row('hips', '2026-09-20', 95)])[0]).toMatchObject({ delta: null, previous: null, entries: 1 });
  });
  it('compares correctly across a cm -> inches switch, reporting in the newest unit', () => {
    const r = latestByKind([row('waist', '2026-09-01', 82.55, 'cm'), row('waist', '2026-09-20', 32, 'in')]);
    expect(r[0].latest.unit).toBe('in');
    expect(r[0].delta).toBe(-0.5); // 32 in (81.28 cm) vs 82.55 cm
  });
  it('orders kinds as listed, with unknown kinds last, and handles empty input', () => {
    const r = latestByKind([row('mystery', '2026-09-20', 1), row('body_fat', '2026-09-20', 18, 'pct'), row('waist', '2026-09-20', 82)]);
    expect(r.map((x) => x.kind)).toEqual(['waist', 'body_fat', 'mystery']);
    expect(latestByKind([])).toEqual([]);
    expect(latestByKind(undefined)).toEqual([]);
  });
});

describe('fitWithin', () => {
  it('scales the long edge down to the limit, keeping proportions', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(3000, 3000, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it('never enlarges a small image', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it('never returns a zero dimension for an extreme aspect ratio', () => {
    expect(fitWithin(20000, 3, 1600)).toEqual({ width: 1600, height: 1 });
  });
  it('returns zeros for garbage input instead of NaN', () => {
    for (const [w, h] of [[0, 100], [100, 0], [NaN, 5], [undefined, 5], [-1, -1]]) expect(fitWithin(w, h)).toEqual({ width: 0, height: 0 });
  });
});

describe('validateImageFile', () => {
  it('accepts an ordinary image and describes the problems otherwise', () => {
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateImageFile({ type: 'image/heic', size: 1000 })).toBeNull();
    expect(validateImageFile(null)).toMatch(/Choose a photo/);
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toMatch(/isn.t an image/);
    expect(validateImageFile({ type: '', size: 10 })).toMatch(/isn.t an image/);
    expect(validateImageFile({ type: 'image/png', size: MAX_INPUT_BYTES + 1 })).toMatch(/too large/);
    expect(validateImageFile({ type: 'image/png', size: MAX_INPUT_BYTES })).toBeNull();
  });
});
