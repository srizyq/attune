// Community's follow and heart notifications need this phone to be registered
// for push. The switches in Edit profile only save a preference, so on their
// own they never asked permission or registered anything — these do that.
import { savePushSubscription } from './db';
import { pushSupported, requestNotificationPermission, subscribeToPush } from './pushNotifications';

const canAsk = () => pushSupported() && typeof Notification !== 'undefined';

/**
 * Turned on by a tap: asks permission if it hasn't been asked, then registers
 * this phone. Resolves to 'granted' | 'denied' | 'unsupported' | 'error'.
 */
export async function askForCommunityPush(userId) {
  if (!canAsk()) return 'unsupported';
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await requestNotificationPermission();
    if (permission !== 'granted') return 'denied';
    const subscription = await subscribeToPush();
    await savePushSubscription(userId, subscription.toJSON());
    return 'granted';
  } catch (err) {
    console.error('Could not register for Community notifications:', err);
    return 'error';
  }
}

// Registering again is harmless, but once per person per visit is plenty.
let registeredFor = null;
export function forgetCommunityPush() { registeredFor = null; }

/** Quietly keeps this phone registered when permission was already given (e.g. after reminders were turned off, which removes it). */
export async function ensureCommunityPush(userId) {
  if (!userId || registeredFor === userId || !canAsk() || Notification.permission !== 'granted') return;
  registeredFor = userId;
  try {
    const subscription = await subscribeToPush();
    await savePushSubscription(userId, subscription.toJSON());
  } catch (err) {
    registeredFor = null;
    console.error('Could not keep Community notifications registered:', err);
  }
}
