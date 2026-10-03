import { describe, it, expect } from 'vitest';
import { assessTDEE, estimateTDEE, computeAdaptiveTarget, computeTrendWeight, computeExpenditureHistory } from './adaptiveTDEE';

const KCAL_PER_KG = 7700;
const day = (n) => new Date(Date.UTC(2026, 7, 1 + n)).toISOString().slice(0, 10);

// A person whose true maintenance is `tdee` and who eats `intake`: weight
// moves by (intake - tdee) / 7700 kg a day, starting from `start` kg.
function scenario({ days = 28, tdee = 2500, intake = 2000, start = 80, weighEvery = 1, noise = () => 0 } = {}) {
  const perDay = (intake - tdee) / KCAL_PER_KG;
  const weights = [];
  const calories = [];
  for (let i = 0; i <= days; i++) {
    if (i % weighEvery === 0) weights.push({ weight: +(start + perDay * i + noise(i)).toFixed(2), unit: 'kg', logged_date: day(i) });
    calories.push({ date: day(i), calories: intake });
  }
  return { weights, calories };
}
const trendOf = (w) => computeTrendWeight(w);

describe('estimateTDEE', () => {
  it('recovers true maintenance from clean data', () => {
    const { weights, calories } = scenario();
    const est = estimateTDEE(trendOf(weights), calories);
    expect(Math.abs(est.tdee - 2500)).toBeLessThan(10);
  });

  it('is not thrown off by a water-weight spike or a fluky first weigh-in', () => {
    // +1.5 kg on the very first weigh-in, +2.5 kg on one mid-window day:
    // the old "last smoothed weight − first weight" method reads the
    // first as a ~1.5 kg loss it never had.
    const noise = (i) => (i === 0 ? 1.5 : i === 14 ? 2.5 : 0);
    const { weights, calories } = scenario({ noise });
    const est = estimateTDEE(trendOf(weights), calories);
    expect(Math.abs(est.tdee - 2500)).toBeLessThan(60);
  });

  it('tolerates day-to-day scale jitter', () => {
    const jitter = [0.6, -0.9, 0.3, 1.1, -0.4, -1.2, 0.8, 0.2, -0.7, 1.0, -0.3, 0.5, -1.0, 0.4];
    const { weights, calories } = scenario({ noise: (i) => jitter[i % jitter.length] });
    const est = estimateTDEE(trendOf(weights), calories);
    expect(Math.abs(est.tdee - 2500)).toBeLessThan(150);
  });

  it('ignores unfinished diary days instead of reading them as eating very little', () => {
    const { weights, calories } = scenario();
    // 6 days where only breakfast got logged.
    const patched = calories.map((d, i) => (i % 5 === 2 ? { ...d, calories: 350 } : d));
    const est = estimateTDEE(trendOf(weights), patched);
    expect(est.excludedDayCount).toBe(6);
    expect(est.avgCalIn).toBe(2000);
    expect(Math.abs(est.tdee - 2500)).toBeLessThan(10);
  });

  it('still works when many days were simply never logged', () => {
    const { weights, calories } = scenario({ weighEvery: 3 });
    // Every other day; weigh-ins end on day 27, so 14 of those fall inside the span.
    const sparse = calories.filter((_, i) => i % 2 === 0);
    const est = estimateTDEE(trendOf(weights), sparse);
    expect(Math.abs(est.tdee - 2500)).toBeLessThan(20);
    expect(est.loggedDayCount).toBe(14);
  });

  it('reports usable and excluded day counts and weigh-in count', () => {
    const { weights, calories } = scenario();
    const est = estimateTDEE(trendOf(weights), calories);
    expect(est).toMatchObject({ loggedDayCount: 29, excludedDayCount: 0, weighInCount: 29, spanDays: 28 });
  });
});

describe('assessTDEE — why it says no', () => {
  it('needs enough span', () => {
    const { weights, calories } = scenario({ days: 9 });
    expect(assessTDEE(trendOf(weights), calories)).toEqual({ ok: false, reason: 'not-enough-span', daysNeeded: 5 });
  });

  it('needs more than a couple of weigh-ins, however far apart', () => {
    const { weights, calories } = scenario({ days: 28, weighEvery: 14 }); // 3 weigh-ins
    expect(assessTDEE(trendOf(weights), calories)).toEqual({ ok: false, reason: 'not-enough-weigh-ins', daysNeeded: 1 });
  });

  it('needs enough *usable* food days — unfinished days do not count toward the minimum', () => {
    const { weights } = scenario();
    const calories = [];
    for (let i = 0; i <= 28; i++) calories.push({ date: day(i), calories: i < 8 ? 2000 : i < 20 ? 300 : 0 });
    const res = assessTDEE(trendOf(weights), calories);
    expect(res).toMatchObject({ ok: false, reason: 'not-enough-logged-days', daysNeeded: 2 });
  });

  it('withholds an estimate nobody could believe rather than targeting it', () => {
    const { weights, calories } = scenario({ intake: 700, tdee: 700 }); // "maintains" on 700 kcal
    expect(assessTDEE(trendOf(weights), calories)).toEqual({ ok: false, reason: 'implausible-estimate' });
    const huge = scenario({ intake: 2000, tdee: 2000, noise: (i) => i * 0.4 }); // gaining 0.4 kg/day on 2000
    expect(assessTDEE(trendOf(huge.weights), huge.calories).reason).toBe('implausible-estimate');
  });

  it('estimateTDEE returns null in each of those cases', () => {
    const { weights, calories } = scenario({ days: 9 });
    expect(estimateTDEE(trendOf(weights), calories)).toBeNull();
  });
});

describe('computeAdaptiveTarget', () => {
  it('applies the goal adjustment on top of estimated maintenance', () => {
    const { weights, calories } = scenario();
    const lose = computeAdaptiveTarget(weights, calories, 'lose');
    const build = computeAdaptiveTarget(weights, calories, 'build');
    expect(lose.ready).toBe(true);
    expect(lose.target).toBe(lose.estimate.tdee - 400);
    expect(build.target).toBe(build.estimate.tdee + 300);
  });

  it('passes the blocking reason and what is still needed through to the UI', () => {
    const { weights, calories } = scenario({ days: 28, weighEvery: 14 });
    expect(computeAdaptiveTarget(weights, calories, 'lose')).toEqual({ ready: false, reason: 'not-enough-weigh-ins', daysNeeded: 1 });
    expect(computeAdaptiveTarget([], [], 'lose')).toEqual({ ready: false, reason: 'no-weight-logs' });
  });
});

describe('computeExpenditureHistory', () => {
  it('plots a steady line for steady data, using the same noise-tolerant estimate', () => {
    const jitter = [0.5, -0.8, 0.2, 0.9, -0.3, -1.0, 0.7];
    const { weights, calories } = scenario({ days: 70, noise: (i) => jitter[i % jitter.length] });
    const history = computeExpenditureHistory(weights, calories);
    expect(history.length).toBeGreaterThan(3);
    for (const p of history) expect(Math.abs(p.tdee - 2500)).toBeLessThan(250);
  });
});

describe('computeAdaptiveTarget with a weekly rate', () => {
  it('offsets maintenance by the chosen rate, same as Calculated mode would', () => {
    const { weights, calories } = scenario();
    const r = computeAdaptiveTarget(weights, calories, 'lose', 0.5);
    expect(r.target).toBe(r.estimate.tdee - 550);
    const b = computeAdaptiveTarget(weights, calories, 'build', 0.25);
    expect(b.target).toBe(b.estimate.tdee + 275);
  });

  it('holds at the safe minimum and says so, rather than targeting something unsafe', () => {
    const { weights, calories } = scenario({ tdee: 1500, intake: 1500, start: 55 });
    const r = computeAdaptiveTarget(weights, calories, 'lose', 1);
    expect(r.target).toBe(1200);
    expect(r.clamped).toBe(true);
  });

  it('reports the actual weekly rate so the UI can compare it with the goal', () => {
    const { weights, calories } = scenario(); // 500 kcal/day deficit = 0.455 kg/week down
    const r = computeAdaptiveTarget(weights, calories, 'lose', 0.5);
    expect(r.estimate.weeklyRateKg).toBeCloseTo(-0.45, 1);
  });
});
