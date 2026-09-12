import { useState } from 'react';
import { useReminders, useTrainerCommentNotifications } from '../../hooks/useReminders';
import { pushSupported } from '../../lib/pushNotifications';
import { SettingsModal, Card, SectionLabel, FieldRow, Toggle } from './primitives';

export default function NotificationsModal({ onClose, closing }) {
  const reminders = useReminders();
  const trainerNotifs = useTrainerCommentNotifications();
  const [reminderTimeInput, setReminderTimeInput] = useState(reminders.time);
  const [reminderError, setReminderError] = useState(null);
  const [trainerNotifError, setTrainerNotifError] = useState(null);

  return (
    <SettingsModal title="Notifications" onClose={onClose} closing={closing}>
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Reminders</SectionLabel>
        <FieldRow label="Daily reminder" hint={reminders.enabled ? `Nudges you at ${reminderTimeInput} if you haven't logged anything yet` : "Nudge to log food if you haven't yet"}>
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
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Time in your device's local timezone</span>
          </div>
        )}
        {!pushSupported() && (
          <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>Push notifications aren't supported in this browser.</p>
        )}
        {reminderError && <p style={{ color: 'var(--danger)', fontSize: 12, margin: '0 0 16px' }}>{reminderError}</p>}
        {[
          { key: 'water', label: 'Water reminders',     hint: 'Gentle reminders to stay hydrated — coming soon' },
          { key: 'mood',  label: 'Daily mood check-in', hint: 'One tap each evening — coming soon' },
        ].map(n => (
          <FieldRow key={n.key} label={n.label} hint={n.hint}>
            <Toggle on={false} onChange={() => {}} />
          </FieldRow>
        ))}
      </Card>

      <Card style={{ marginBottom: 0 }}>
        <SectionLabel>Updates</SectionLabel>
        <FieldRow label="Trainer updates" hint="When your trainer leaves you a note">
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
        {[
          { key: 'recap', label: 'Weekly recap',     hint: 'Your shareable Sunday summary — coming soon' },
          { key: 'ai',    label: 'Pattern insights', hint: 'Nudges based on your logged patterns — coming soon' },
        ].map(n => (
          <FieldRow key={n.key} label={n.label} hint={n.hint}>
            <Toggle on={false} onChange={() => {}} />
          </FieldRow>
        ))}
      </Card>
    </SettingsModal>
  );
}
