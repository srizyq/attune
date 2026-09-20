import { describe, it, expect } from 'vitest';
import {
  grantsAccess, planOf, checkoutCompletedFields, subscriptionUpdate, subscriptionDeletion, coachTrialDays, COACH_TRIAL_DAYS,
} from './_stripeState.js';

describe('grantsAccess', () => {
  it('counts a free trial as paying, and only that and active', () => {
    expect(grantsAccess('active')).toBe(true);
    expect(grantsAccess('trialing')).toBe(true);
    for (const s of ['past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', undefined, null, '']) {
      expect(grantsAccess(s)).toBe(false);
    }
  });
});

describe('planOf', () => {
  it('defaults to coach — every pre-Pro subscription has no plan metadata', () => {
    expect(planOf({ metadata: { plan: 'pro' } })).toBe('pro');
    expect(planOf({ metadata: { plan: 'coach' } })).toBe('coach');
    expect(planOf({ metadata: {} })).toBe('coach');
    expect(planOf({})).toBe('coach');
    expect(planOf(undefined)).toBe('coach');
  });
});

describe('checkoutCompletedFields', () => {
  it('grants the Coach Pass for a trial signup and records the real status', () => {
    expect(checkoutCompletedFields({ plan: 'coach', customerId: 'cus_1', subscriptionId: 'sub_1', status: 'trialing' })).toEqual({
      coach_pass: true, coach_pass_status: 'trialing', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1',
    });
  });
  it('falls back to active when the subscription lookup failed', () => {
    expect(checkoutCompletedFields({ plan: 'coach', customerId: 'c', subscriptionId: 's' })).toMatchObject({ coach_pass: true, coach_pass_status: 'active' });
  });
  it('writes the Pro columns for a Pro checkout and leaves the coach ones alone', () => {
    const f = checkoutCompletedFields({ plan: 'pro', customerId: 'c', subscriptionId: 's', status: 'active' });
    expect(f).toEqual({ is_premium: true, pro_status: 'active', stripe_customer_id: 'c', stripe_pro_subscription_id: 's' });
    expect(f).not.toHaveProperty('coach_pass');
  });
  it('does not grant access for a subscription that is not actually paying', () => {
    expect(checkoutCompletedFields({ plan: 'coach', customerId: 'c', subscriptionId: 's', status: 'incomplete' }).coach_pass).toBe(false);
  });
});

describe('subscriptionUpdate', () => {
  it('keeps the pass while trialing (the regression this module exists to prevent)', () => {
    expect(subscriptionUpdate({ id: 'sub_1', status: 'trialing', metadata: {} })).toEqual({
      match: { column: 'stripe_subscription_id', value: 'sub_1' },
      fields: { coach_pass: true, coach_pass_status: 'trialing' },
    });
  });
  it('keeps the pass when a trial converts to a paid subscription', () => {
    expect(subscriptionUpdate({ id: 'sub_1', status: 'active', metadata: {} }).fields).toEqual({ coach_pass: true, coach_pass_status: 'active' });
  });
  it.each(['past_due', 'unpaid', 'paused', 'incomplete_expired'])('withdraws the pass on %s but keeps the status for display', (status) => {
    expect(subscriptionUpdate({ id: 's', status, metadata: {} }).fields).toEqual({ coach_pass: false, coach_pass_status: status });
  });
  it('targets the Pro columns for a Pro subscription', () => {
    expect(subscriptionUpdate({ id: 'sub_p', status: 'active', metadata: { plan: 'pro' } })).toEqual({
      match: { column: 'stripe_pro_subscription_id', value: 'sub_p' },
      fields: { is_premium: true, pro_status: 'active' },
    });
  });
});

describe('subscriptionDeletion', () => {
  it('removes coach access and coach mode', () => {
    expect(subscriptionDeletion({ id: 'sub_1', metadata: {} })).toEqual({
      match: { column: 'stripe_subscription_id', value: 'sub_1' },
      fields: { coach_pass: false, coach_mode: false, coach_pass_status: 'canceled' },
    });
  });
  it('removes Pro without touching the coach pass', () => {
    const r = subscriptionDeletion({ id: 'sub_p', metadata: { plan: 'pro' } });
    expect(r.fields).toEqual({ is_premium: false, pro_status: 'canceled' });
    expect(r.match.column).toBe('stripe_pro_subscription_id');
  });
});

describe('coachTrialDays', () => {
  it('offers the trial to someone who has never had a Coach Pass', () => {
    expect(coachTrialDays('coach', {})).toBe(COACH_TRIAL_DAYS);
    expect(coachTrialDays('coach', null)).toBe(COACH_TRIAL_DAYS);
    expect(coachTrialDays('coach', { stripe_customer_id: 'cus_from_pro' })).toBe(COACH_TRIAL_DAYS);
  });
  it('never offers it twice, whether or not the subscription is still live', () => {
    expect(coachTrialDays('coach', { stripe_subscription_id: 'sub_old' })).toBeUndefined();
    expect(coachTrialDays('coach', { coach_pass_status: 'canceled' })).toBeUndefined();
    expect(coachTrialDays('coach', { coach_pass_status: 'trialing' })).toBeUndefined();
  });
  it('is a Coach Pass thing only', () => {
    expect(coachTrialDays('pro', {})).toBeUndefined();
  });
});
