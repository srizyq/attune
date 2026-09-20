// Display-side helpers for the Coach Pass. The server (api/_stripeState.js
// coachTrialDays) is the authority on who gets a trial; this mirrors its rule
// only to label the button honestly.
export const COACH_TRIAL_DAYS = 30;

// Never had a Coach Pass subscription (paid, trialing or cancelled): the same
// test the server applies before adding a trial to Checkout.
export function eligibleForCoachTrial(profile) {
  return !!profile && !profile.coach_pass && !profile.stripe_subscription_id && !profile.coach_pass_status;
}

export function coachPassButtonLabel(profile) {
  return eligibleForCoachTrial(profile) ? `Start ${COACH_TRIAL_DAYS}-day free trial` : 'Start Coach Pass';
}

const STATUS_LABELS = {
  active: 'Active subscription',
  trialing: 'Free trial',
  past_due: 'Payment failed — update your card',
  unpaid: 'Payment failed — update your card',
  canceled: 'Cancelled',
  paused: 'Paused',
  incomplete: 'Awaiting payment',
  incomplete_expired: 'Expired',
};

// The one-line status shown under "Coach Pass" in Settings.
export function coachPassHint(profile) {
  if (!profile?.coach_pass) return 'Unlimited clients';
  if (!profile.stripe_subscription_id) return 'Comp access';
  return STATUS_LABELS[profile.coach_pass_status || 'active'] || 'Active subscription';
}
