import { describe, it, expect } from 'vitest';
import { isTrialActive, trialDaysLeft, trialJustEnded, canClaimFreeMonth } from './trial';

const future = (days) => new Date(Date.now() + days * 86400000).toISOString();
const past = (days) => new Date(Date.now() - days * 86400000).toISOString();

describe('isTrialActive', () => {
  it('is true with a future trial_ends_at', () => {
    expect(isTrialActive({ trial_ends_at: future(5) })).toBe(true);
  });
  it('is false once trial_ends_at has passed', () => {
    expect(isTrialActive({ trial_ends_at: past(1) })).toBe(false);
  });
  it('is false with no trial_ends_at at all', () => {
    expect(isTrialActive({ trial_ends_at: null })).toBe(false);
    expect(isTrialActive(null)).toBe(false);
  });
});

describe('trialDaysLeft', () => {
  it('rounds up so part of a day still reads as 1, not 0', () => {
    expect(trialDaysLeft({ trial_ends_at: future(0.1) })).toBe(1);
  });
  it('is 0 when there is no active trial', () => {
    expect(trialDaysLeft({ trial_ends_at: past(1) })).toBe(0);
  });
});

describe('trialJustEnded', () => {
  it('is true for a lapsed trial that never converted', () => {
    expect(trialJustEnded({ trial_ends_at: past(1), is_premium: false })).toBe(true);
  });
  it('is false if they are premium now (converted, or comped)', () => {
    expect(trialJustEnded({ trial_ends_at: past(1), is_premium: true })).toBe(false);
  });
  it('is false for an account that never had a trial', () => {
    expect(trialJustEnded({ trial_ends_at: null, is_premium: false })).toBe(false);
  });
  it('is false for a lapsed trial if they still have Pro via a Coach Pass', () => {
    expect(trialJustEnded({ trial_ends_at: past(1), is_premium: false, coach_pass: true })).toBe(false);
  });
});

describe('canClaimFreeMonth', () => {
  it('is true for an account that never started a trial and is not premium', () => {
    expect(canClaimFreeMonth({ trial_ends_at: null, is_premium: false })).toBe(true);
  });
  it('is false once a trial has ever been started, active or lapsed', () => {
    expect(canClaimFreeMonth({ trial_ends_at: future(5), is_premium: true })).toBe(false);
    expect(canClaimFreeMonth({ trial_ends_at: past(5), is_premium: false })).toBe(false);
  });
  it('is false for someone already premium (real subscription or comp grant) even with no trial record', () => {
    expect(canClaimFreeMonth({ trial_ends_at: null, is_premium: true })).toBe(false);
  });
  it('is false with no profile', () => {
    expect(canClaimFreeMonth(null)).toBe(false);
  });
  it('is false for a Coach Pass holder — they already have Pro, so a trial of it would be wasted', () => {
    expect(canClaimFreeMonth({ trial_ends_at: null, is_premium: false, coach_pass: true })).toBe(false);
  });
});
