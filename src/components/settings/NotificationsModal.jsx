import { useState } from 'react';
import { useReminders, useTrainerCommentNotifications, useClientActivityNotifications } from '../../hooks/useReminders';
import { useProfile } from '../../hooks/useProfile';
import { pushSupported } from '../../lib/pushNotifications';
import { localNotificationsAvailable, getLocalPrefs, setLocalPref } from '../../lib/localNotifications';
import { SettingsModal, Card, SectionLabel, FieldRow, Toggle } from './primitives';

export default function NotificationsModal({ onClose, closing }) {
  const reminders = useReminders();
  const trainerNotifs = useTrainerCommentNotifications();
  const activityNotifs = useClientActivityNotifications();
  const { profile } = useProfile();
  const [activityNotifError, setActivityNotifError] = useState(null);
  const [reminderTimeInput, setReminderTimeInput] = useState(reminders.time);
  const [reminderError, setReminderError] = useState(null);
  const [trainerNotifError, setTrainerNotifError] = useState(null);
  // Water, mood, recap and insights are notifications the iPhone app schedules
  // on the phone itself — see lib/localNotifications.js.
  const native = localNotificationsAvailable();
  const [localPrefs, setLocalPrefs] = useState(getLocalPrefs);
  const [localError, setLocalError] = useState(null);
  const setLocal = async (key, on) => {
    setLocalError(null);
    try {
      await setLocalPref(key, on);
      setLocalPrefs((p) => ({ ...p, [key]: on }));
    } catch (err) {
      setLocalError(err.message || "Couldn't update this — try again.");
    }
  };
  const localRow = (key, label, hint) => (
    <FieldRow key={key} label={label} hint={native ? hint : `${hint} — in the Attune iPhone app`}>
      <Toggle on={native && localPrefs[key]} onChange={(on) => setLocal(key, on)} />
    </FieldRow>
  );
  const pushGap = native && !pushSupported();

  return (
    <SettingsModal title="Notifications" onClose={onClose} closing={closing}>
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Reminders</SectionLabel>
        <FieldRow label="Daily reminder">
          <Toggle
            on={reminders.enabled}
            onChange={async (on) => {
              setReminderError(null);
              try {
                if (on) await reminders.enable(reminderTimeInput);
                else await reminders.disable();
              } catch (err) {
                setReminderError(err.message || "Couldn't update reminders — try again.");
              }
            }}
          />
        </FieldRow>
        {reminders.enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: '-4px', marginBottom: '16px' }}>
            <input
              type="time"
              value={reminderTimeInput}
              onChange={async (e) => {
                setReminderTimeInput(e.target.value);
                try { await reminders.setTime(e.target.value); } catch { setReminderError("Couldn't save the new time — try again."); }
              }}
              style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)', borderRadius: 7, padding: '7px 10px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'inherit' }}
            />
          </div>
        )}
        {!native && !pushSupported() && (
          <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>Push notifications aren't supported in this browser.</p>
        )}
        {reminderError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>{reminderError}</p>}
        {localRow('water', 'Water reminders', 'Five gentle nudges between 10am and 6pm')}
        {localRow('mood', 'Daily mood check-in', 'One tap each evening, 8:30pm')}
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <SectionLabel>Updates</SectionLabel>
        <FieldRow label="Trainer updates" hint={pushGap ? 'Not in the iPhone app yet' : undefined}>
          <Toggle
            on={trainerNotifs.enabled}
            onChange={async (on) => {
              setTrainerNotifError(null);
              try {
                if (on) await trainerNotifs.enable();
                else await trainerNotifs.disable();
              } catch (err) {
                setTrainerNotifError(err.message || "Couldn't update this — try again.");
              }
            }}
          />
        </FieldRow>
        {trainerNotifError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>{trainerNotifError}</p>}
        {profile?.coach_pass && (
          <>
            <FieldRow label="Client activity" hint={pushGap ? 'Not in the iPhone app yet' : undefined}>
              <Toggle
                on={activityNotifs.enabled}
                onChange={async (on) => {
                  setActivityNotifError(null);
                  try {
                    if (on) await activityNotifs.enable();
                    else await activityNotifs.disable();
                  } catch (err) {
                    setActivityNotifError(err.message || "Couldn't update this — try again.");
                  }
                }}
              />
            </FieldRow>
            {activityNotifError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>{activityNotifError}</p>}
          </>
        )}
        {localRow('recap', 'Weekly recap', 'Your Sunday summary, 6pm')}
        {localRow('insights', 'Pattern insights', 'A nudge to check your patterns, Wed and Sat')}
        {localError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '12px 0 0' }}>{localError}</p>}
      </Card>
    </SettingsModal>
  );
}
