import { describe, it, expect } from 'vitest';
import {
  WEEKDAYS, TARGET_FIELDS, MAX_CALORIES, MAX_GRAMS, dowOf, dayTargetsActive, targetsForDate,
  dayTargetsToInputs, parseDayTargetInputs, describeTrainingDays,
} from './dayTargets';

// Sunday 2026-09-20 ... Saturday 2026-09-26.
const SUN = '2026-09-20', MON = '2026-09-21', TUE = '2026-09-22', SAT = '2026-09-26';
const profile = (over = {}) => ({ calorie_target: 2500, protein_g: 180, carbs_g: 280, fat_g: 70, rest_day_targets: { calories: 1800, protein_g: 150 }, training_days: [1, 3, 5], ...over });

describe('dowOf', () => {
  it('numbers weekdays like JavaScript getDay: Sunday 0 .. Saturday 6', () => {
    expect(dowOf(SUN)).toBe(0);
    expect(dowOf(MON)).toBe(1);
    expect(dowOf(SAT)).toBe(6);
  });
  it('depends on the calendar date only, not a time or timezone, and rejects junk', () => {
    expect(dowOf('2026-09-21T23:59:59Z')).toBe(1);
    expect(dowOf('nope')).toBeNull();
    expect(dowOf(undefined)).toBeNull();
  });
  it('WEEKDAYS covers each day once, Monday first', () => {
    expect(WEEKDAYS.map((d) => d.dow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(WEEKDAYS.every((d) => dowOf(`2026-09-${20 + (d.dow === 0 ? 0 : d.dow)}`) === d.dow)).toBe(true);
  });
});

describe('dayTargetsActive', () => {
  it('needs both rest-day targets and training days', () => {
    expect(dayTargetsActive(profile())).toBe(true);
    expect(dayTargetsActive(profile({ rest_day_targets: null }))).toBe(false);
    expect(dayTargetsActive(profile({ rest_day_targets: {} }))).toBe(false);
    expect(dayTargetsActive(profile({ training_days: [] }))).toBe(false);
    expect(dayTargetsActive(profile({ training_days: null }))).toBe(false);
    expect(dayTargetsActive(null)).toBe(false);
    expect(dayTargetsActive({})).toBe(false);
  });
});

describe('targetsForDate', () => {
  it('gives the base targets on a training day', () => {
    expect(targetsForDate(profile(), MON)).toEqual({ calories: 2500, protein_g: 180, carbs_g: 280, fat_g: 70, isRestDay: false });
  });
  it('gives the rest-day targets on a rest day, falling back to base for anything not overridden', () => {
    expect(targetsForDate(profile(), SUN)).toEqual({ calories: 1800, protein_g: 150, carbs_g: 280, fat_g: 70, isRestDay: true });
    expect(targetsForDate(profile(), TUE).isRestDay).toBe(true);
  });
  it('honours an explicit zero override (it is a target, not "unset")', () => {
    expect(targetsForDate(profile({ rest_day_targets: { carbs_g: 0 } }), SUN).carbs_g).toBe(0);
  });
  it('changes nothing when the feature is off or half-set', () => {
    for (const over of [{ rest_day_targets: null }, { training_days: [] }, { training_days: null }]) {
      expect(targetsForDate(profile(over), SUN)).toEqual({ calories: 2500, protein_g: 180, carbs_g: 280, fat_g: 70, isRestDay: false });
    }
  });
  it('returns nulls for unset base targets, and a rest target still applies on rest days', () => {
    const p = { calorie_target: null, rest_day_targets: { calories: 1500 }, training_days: [1] };
    expect(targetsForDate(p, MON).calories).toBeNull();
    expect(targetsForDate(p, SUN).calories).toBe(1500);
    expect(targetsForDate({}, SUN)).toEqual({ calories: null, protein_g: null, carbs_g: null, fat_g: null, isRestDay: false });
    expect(targetsForDate(null, SUN).calories).toBeNull();
  });
  it('falls back to base for a bad date rather than guessing a day', () => {
    expect(targetsForDate(profile(), 'bad')).toMatchObject({ calories: 2500, isRestDay: false });
  });
  it('does not treat a non-numeric stored override as a target', () => {
    expect(targetsForDate(profile({ rest_day_targets: { calories: '1800' } }), SUN).calories).toBe(2500);
  });
});

describe('parseDayTargetInputs', () => {
  it('builds the rest set and sorted, de-duplicated days from form text', () => {
    expect(parseDayTargetInputs({ calories: ' 1800 ', protein_g: '150', carbs_g: '', fat_g: '' }, [5, 1, 3, 1])).toEqual({ rest: { calories: 1800, protein_g: 150 }, trainingDays: [1, 3, 5], error: null });
  });
  it('nothing entered and no days means "not using it" — clear both', () => {
    expect(parseDayTargetInputs({}, [])).toEqual({ rest: null, trainingDays: null, error: null });
    expect(parseDayTargetInputs({ calories: '', protein_g: '' }, undefined)).toEqual({ rest: null, trainingDays: null, error: null });
  });
  it('asks for whichever half is missing', () => {
    expect(parseDayTargetInputs({ calories: '1800' }, []).error).toMatch(/Choose which weekdays/);
    expect(parseDayTargetInputs({}, [1]).error).toMatch(/at least one rest-day target/);
  });
  it('refuses a week that is all training days, since rest-day targets could never apply', () => {
    expect(parseDayTargetInputs({ calories: '1800' }, [0, 1, 2, 3, 4, 5, 6]).error).toMatch(/Every day/);
  });
  it('validates numbers against the same limits as the database', () => {
    expect(parseDayTargetInputs({ calories: '-1' }, [1]).error).toMatch(/Calories must be a number between 0 and 20,000/);
    expect(parseDayTargetInputs({ calories: 'abc' }, [1]).error).toMatch(/Calories/);
    expect(parseDayTargetInputs({ calories: 'Infinity' }, [1]).error).toMatch(/Calories/);
    expect(parseDayTargetInputs({ protein_g: String(MAX_GRAMS + 1) }, [1]).error).toMatch(/Protein/);
    expect(parseDayTargetInputs({ calories: String(MAX_CALORIES), fat_g: '0' }, [1]).error).toBeNull(); // zero is a real target
  });
  it('drops out-of-range or non-integer days instead of sending junk', () => {
    expect(parseDayTargetInputs({ calories: '1800' }, [7, -1, 1.5, 2]).trainingDays).toEqual([2]);
  });
});

describe('dayTargetsToInputs / describeTrainingDays', () => {
  it('round-trips a stored profile through the form and back', () => {
    const p = profile();
    const { inputs, trainingDays } = dayTargetsToInputs(p);
    expect(inputs).toEqual({ calories: '1800', protein_g: '150', carbs_g: '', fat_g: '' });
    expect(parseDayTargetInputs(inputs, trainingDays)).toEqual({ rest: p.rest_day_targets, trainingDays: p.training_days, error: null });
  });
  it('is empty for a profile without the feature (or without the columns at all)', () => {
    expect(dayTargetsToInputs({})).toEqual({ inputs: { calories: '', protein_g: '', carbs_g: '', fat_g: '' }, trainingDays: [] });
    expect(dayTargetsToInputs(null).trainingDays).toEqual([]);
  });
  it('lists training days Monday-first', () => {
    expect(describeTrainingDays([0, 5, 1])).toBe('Mon, Fri, Sun');
    expect(describeTrainingDays(null)).toBe('');
  });
  it('TARGET_FIELDS cover the four targets', () => {
    expect(TARGET_FIELDS.map((f) => f.key)).toEqual(['calories', 'protein_g', 'carbs_g', 'fat_g']);
  });
});
