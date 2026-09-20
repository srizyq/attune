// A device has exactly one push subscription, shared by every notification
// preference on the profile. Turning one preference off must only tear the
// subscription down if none of the others still need it — otherwise switching
// off, say, daily reminders would silently kill trainer notifications too.
// Each new push-backed preference gets added here and nowhere else.
export const PUSH_PREFS = ['reminder_enabled', 'notify_trainer_comments', 'notify_client_activity'];

export function stillNeedsPush(profile, disabling) {
  return PUSH_PREFS.some((key) => key !== disabling && !!profile?.[key]);
}
