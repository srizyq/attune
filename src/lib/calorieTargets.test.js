import { describe, it, expect } from 'vitest';
import { calcCalories, calcGoalAdjustment, clampToFloor, defaultPace, paceWarning, projectFinish, MIN_CALORIES } from './calorieTargets';

const base = { weight: 80, height: 180, age: 30, unit: 'metric', activity: 'moderate' };

describe('calcCalories', () => {
  it('uses sex — Mifflin–St Jeor is 166 kcal apart male vs female before activity', () => {
    const male = calcCalories({ ...base, sex: 'male', goal: 'maintain' });
    const female = calcCalories({ ...base, sex: 'female', goal: 'maintain' });
    expect(male - female).toBe(Math.round(166 * 1.55));
  });

  it('turns the weekly rate into the offset: 0.5 kg/week is ~550 kcal/day', () => {
    const maintain = calcCalories({ ...base, sex: 'male', goal: 'maintain' });
    expect(calcCalories({ ...base, sex: 'male', goal: 'lose', paceKgPerWeek: 0.5 })).toBe(maintain - 550);
    expect(calcCalories({ ...base, sex: 'male', goal: 'build', paceKgPerWeek: 0.25 })).toBe(maintain + 275);
  });

  it('never goes below the safe minimum, however steep the rate', () => {
    const small = { weight: 48, height: 150, age: 60, unit: 'metric', activity: 'sedentary', sex: 'female', goal: 'lose', paceKgPerWeek: 1 };
    expect(calcCalories(small)).toBe(MIN_CALORIES);
  });
});

describe('clampToFloor', () => {
  it('flags only when it actually clamped', () => {
    expect(clampToFloor(1100)).toEqual({ calories: MIN_CALORIES, clamped: true });
    expect(clampToFloor(MIN_CALORIES)).toEqual({ calories: MIN_CALORIES, clamped: false });
    expect(clampToFloor(2000)).toEqual({ calories: 2000, clamped: false });
  });
});

describe('defaultPace / calcGoalAdjustment', () => {
  it('has a default for lose and build only', () => {
    expect(defaultPace('lose')).toBe(0.35);
    expect(defaultPace('build')).toBe(0.25);
    expect(defaultPace('maintain')).toBeNull();
  });
  it('ignores a rate for maintain', () => {
    expect(calcGoalAdjustment('maintain', 0.5)).toBe(0);
  });
});

describe('paceWarning', () => {
  it('stays quiet at a sensible rate and speaks up past 1%/week when cutting', () => {
    expect(paceWarning('lose', 0.5, 80)).toBeNull();
    expect(paceWarning('lose', 0.9, 80)).toMatch(/1\.1% of your body weight/);
  });
  it('uses a lower threshold when building (0.5%/week)', () => {
    expect(paceWarning('build', 0.3, 80)).toBeNull();
    expect(paceWarning('build', 0.5, 80)).toMatch(/0\.6%/);
  });
  it('says nothing for maintain or missing data', () => {
    expect(paceWarning('maintain', 0.5, 80)).toBeNull();
    expect(paceWarning('lose', null, 80)).toBeNull();
  });
});

describe('projectFinish', () => {
  const from = new Date(2026, 9, 1); // 1 Oct 2026
  it('projects weeks and a date at a steady rate', () => {
    const r = projectFinish('lose', 80, 75, 0.5, from);
    expect(r.status).toBe('on-track');
    expect(r.weeks).toBe(10);
    expect(r.date).toEqual(new Date(2026, 9, 11 + 60)); // 70 days later
  });
  it('works for building too', () => {
    const r = projectFinish('build', 70, 72, 0.25, from);
    expect(r).toMatchObject({ status: 'on-track', weeks: 8 });
  });
  it('says reached when already at the target, and flags a target on the wrong side', () => {
    expect(projectFinish('lose', 75, 75, 0.5, from).status).toBe('reached');
    expect(projectFinish('lose', 70, 75, 0.5, from).status).toBe('wrong-direction');
    expect(projectFinish('build', 80, 75, 0.25, from).status).toBe('wrong-direction');
  });
  it('gives nothing to project from missing inputs or maintain', () => {
    expect(projectFinish('maintain', 80, 75, 0.5, from)).toBeNull();
    expect(projectFinish('lose', 80, null, 0.5, from)).toBeNull();
    expect(projectFinish('lose', 80, 75, 0, from)).toBeNull();
  });
});
