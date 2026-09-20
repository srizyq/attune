import { describe, it, expect } from 'vitest';
import { PUSH_PREFS, stillNeedsPush } from './pushPrefs.js';

describe('stillNeedsPush', () => {
  it('keeps the subscription while any other preference is on', () => {
    expect(stillNeedsPush({ reminder_enabled: true, notify_client_activity: true }, 'reminder_enabled')).toBe(true);
    expect(stillNeedsPush({ notify_trainer_comments: true, notify_client_activity: true }, 'notify_client_activity')).toBe(true);
    expect(stillNeedsPush({ reminder_enabled: true, notify_trainer_comments: true }, 'notify_client_activity')).toBe(true);
  });
  it('lets it go when the one being disabled was the last', () => {
    for (const key of PUSH_PREFS) expect(stillNeedsPush({ [key]: true }, key)).toBe(false);
    expect(stillNeedsPush({}, 'reminder_enabled')).toBe(false);
    expect(stillNeedsPush(null, 'reminder_enabled')).toBe(false);
  });
  it('ignores the preference being disabled even though it is still true in the stale profile', () => {
    expect(stillNeedsPush({ reminder_enabled: true }, 'reminder_enabled')).toBe(false);
  });
});
