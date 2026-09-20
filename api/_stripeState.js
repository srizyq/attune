// The pure decision logic behind api/stripe-webhook.js and
// api/create-checkout-session.js — what a Stripe event should do to a
// profile, and who gets a free trial — kept free of I/O so it can be tested
// exhaustively (api/_stripeState.test.js). The leading underscore keeps
// Vercel from deploying it as its own endpoint (same convention as
// _fatsecretAuth.js).

// A subscription in its free trial has status 'trialing', not 'active'. The
// webhook used to grant access only on 'active', which would have revoked
// the pass the moment Stripe reported a brand-new trial subscription.
const ACCESS_STATUSES = new Set(['active', 'trialing']);
export const COACH_TRIAL_DAYS = 30;

export function grantsAccess(status) {
  return ACCESS_STATUSES.has(status);
}

export function planOf(stripeObject) {
  return stripeObject?.metadata?.plan === 'pro' ? 'pro' : 'coach';
}

// Which column pair a plan's subscription lives in.
const COLUMNS = {
  pro: { flag: 'is_premium', status: 'pro_status', subscriptionId: 'stripe_pro_subscription_id' },
  coach: { flag: 'coach_pass', status: 'coach_pass_status', subscriptionId: 'stripe_subscription_id' },
};

// checkout.session.completed → the profile fields to write. `status` is the
// subscription's real status when the caller could fetch it ('trialing' for
// a trial signup); 'active' is only the fallback when that lookup failed,
// and the subscription.updated event that follows corrects it.
export function checkoutCompletedFields({ plan, customerId, subscriptionId, status }) {
  const cols = COLUMNS[plan === 'pro' ? 'pro' : 'coach'];
  const effective = status || 'active';
  return {
    [cols.flag]: grantsAccess(effective),
    [cols.status]: effective,
    stripe_customer_id: customerId,
    [cols.subscriptionId]: subscriptionId,
  };
}

// customer.subscription.updated → which profile row and what to set. Covers
// renewals, a trial converting to paid, payment failures and reactivation.
export function subscriptionUpdate(sub) {
  const cols = COLUMNS[planOf(sub)];
  return {
    match: { column: cols.subscriptionId, value: sub.id },
    fields: { [cols.flag]: grantsAccess(sub.status), [cols.status]: sub.status },
  };
}

// customer.subscription.deleted → cancellation. A lapsed coach also loses
// coach_mode so they aren't left sitting on a page they can no longer use.
export function subscriptionDeletion(sub) {
  const plan = planOf(sub);
  const cols = COLUMNS[plan];
  return {
    match: { column: cols.subscriptionId, value: sub.id },
    fields: plan === 'pro'
      ? { is_premium: false, pro_status: 'canceled' }
      : { coach_pass: false, coach_mode: false, coach_pass_status: 'canceled' },
  };
}

// A free Coach Pass trial is one per person: only someone who has never had
// a Coach Pass subscription gets it. Otherwise cancelling and resubscribing
// would be a free month, forever. (A Pro subscription — same Stripe customer
// — doesn't count against this; it's a different product.)
export function coachTrialDays(plan, profile) {
  if (plan !== 'coach') return undefined;
  if (profile?.stripe_subscription_id || profile?.coach_pass_status) return undefined;
  return COACH_TRIAL_DAYS;
}
