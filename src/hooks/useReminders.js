import { useCallback, useState } from 'react';
import { useAuth } from './useAuth';
import { useProfile } from './useProfile';
import { savePushSubscription, deletePushSubscriptionByEndpoint } from '../lib/db';
import { pushSupported, requestNotificationPermission, subscribeToPush, unsubscribeFromPush } from '../lib/pushNotifications';

// Ties together the profile's reminder settings (enabled/time/timezone)
// with the actual browser push subscription — enabling reminders means
// asking for notification permission, subscribing this device to push,
// and saving that subscription server-side so the reminders cron can
// reach it; disabling unwinds all of that.
export function useReminders() {
  const { user } = useAuth();
  const { profile, save } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const enable = useCallback(async (time) => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (!pushSupported()) throw new Error('Push notifications are not supported in this browser.');
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const subscription = await subscribeToPush();
      await savePushSubscription(user.id, subscription.toJSON());
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await save({ reminder_enabled: true, reminder_time: time, reminder_timezone: timezone });
    } catch (err) {
      console.error('Failed to enable reminders:', err);
      setError(err.message || "Couldn't enable reminders — try again.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [user, save]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Trainer-comment notifications (see useTrainerCommentNotifications
      // below) share this same device's one push subscription — only tear
      // it down once nothing else on this profile still needs it, or
      // disabling reminders alone would silently kill trainer updates too.
      if (!profile?.notify_trainer_comments) {
        const existing = await unsubscribeFromPush();
        if (existing) await deletePushSubscriptionByEndpoint(existing.endpoint);
      }
      await save({ reminder_enabled: false });
    } catch (err) {
      console.error('Failed to disable reminders:', err);
      setError("Couldn't disable reminders — try again.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [save, profile]);

  const setTime = useCallback(async (time) => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await save({ reminder_time: time, reminder_timezone: timezone });
  }, [save]);

  return {
    enabled: !!profile?.reminder_enabled,
    time: profile?.reminder_time || '19:00',
    busy,
    error,
    enable,
    disable,
    setTime,
  };
}

// Settings > Notifications' "Trainer updates" toggle — a push sent by
// api/notify-trainer-comment.js whenever this client's trainer leaves a
// comment (see useCoach.js's addComment). Same push subscription as
// useReminders above (a device only has one), so enabling here reuses an
// existing subscription instead of creating a second one, and disabling
// only tears it down if reminders aren't also relying on it.
export function useTrainerCommentNotifications() {
  const { user } = useAuth();
  const { profile, save } = useProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const enable = useCallback(async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      if (!pushSupported()) throw new Error('Push notifications are not supported in this browser.');
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted.');
      const subscription = await subscribeToPush();
      await savePushSubscription(user.id, subscription.toJSON());
      await save({ notify_trainer_comments: true });
    } catch (err) {
      console.error('Failed to enable trainer-comment notifications:', err);
      setError(err.message || "Couldn't enable this — try again.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [user, save]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!profile?.reminder_enabled) {
        const existing = await unsubscribeFromPush();
        if (existing) await deletePushSubscriptionByEndpoint(existing.endpoint);
      }
      await save({ notify_trainer_comments: false });
    } catch (err) {
      console.error('Failed to disable trainer-comment notifications:', err);
      setError("Couldn't disable this — try again.");
      throw err;
    } finally {
      setBusy(false);
    }
  }, [save, profile]);

  return {
    enabled: !!profile?.notify_trainer_comments,
    busy,
    error,
    enable,
    disable,
  };
}
