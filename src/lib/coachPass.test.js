import { describe, it, expect } from 'vitest';
import { eligibleForCoachTrial, coachPassButtonLabel, coachPassHint } from './coachPass.js';

describe('eligibleForCoachTrial (mirrors the server rule)', () => {
  it('is for people who have never had a Coach Pass subscription', () => {
    expect(eligibleForCoachTrial({})).toBe(true);
    expect(eligibleForCoachTrial({ stripe_customer_id: 'cus_from_pro', is_premium: true })).toBe(true);
  });
  it('is not for current, past or comp holders, or before the profile loads', () => {
    expect(eligibleForCoachTrial({ coach_pass: true })).toBe(false);
    expect(eligibleForCoachTrial({ stripe_subscription_id: 'sub' })).toBe(false);
    expect(eligibleForCoachTrial({ coach_pass_status: 'canceled' })).toBe(false);
    expect(eligibleForCoachTrial(null)).toBe(false);
  });
});

describe('coachPassButtonLabel', () => {
  it('advertises the trial only when it will really be granted', () => {
    expect(coachPassButtonLabel({})).toBe('Start 30-day free trial');
    expect(coachPassButtonLabel({ coach_pass_status: 'canceled' })).toBe('Start Coach Pass');
  });
});

describe('coachPassHint', () => {
  it('describes each state in words', () => {
    expect(coachPassHint({ coach_pass: false })).toBe('Unlimited clients');
    expect(coachPassHint({ coach_pass: true })).toBe('Comp access');
    expect(coachPassHint({ coach_pass: true, stripe_subscription_id: 's', coach_pass_status: 'trialing' })).toBe('Free trial');
    expect(coachPassHint({ coach_pass: true, stripe_subscription_id: 's', coach_pass_status: 'active' })).toBe('Active subscription');
    expect(coachPassHint({ coach_pass: true, stripe_subscription_id: 's' })).toBe('Active subscription');
    expect(coachPassHint({ coach_pass: true, stripe_subscription_id: 's', coach_pass_status: 'something_new' })).toBe('Active subscription');
  });
});
