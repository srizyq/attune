import { describe, it, expect } from 'vitest';
import { pickFinishedFasts, fastEndPayload } from './_fastPush.js';

const fast = (over = {}) => ({ id: 'f', user_id: 'u', started_at: '2026-10-05T20:00:00Z', target_hours: 16, ended_at: null, end_notified_at: null, ...over });
const at = (iso) => new Date(iso).getTime();

describe('pickFinishedFasts', () => {
  it('picks a fast whose goal time has arrived, and not one a minute early', () => {
    expect(pickFinishedFasts([fast()], at('2026-10-06T12:00:00Z'))).toHaveLength(1);
    expect(pickFinishedFasts([fast()], at('2026-10-06T11:59:00Z'))).toHaveLength(0);
  });
  it('skips fasts already ended or already notified', () => {
    const now = at('2026-10-07T00:00:00Z');
    expect(pickFinishedFasts([fast({ ended_at: '2026-10-06T08:00:00Z' })], now)).toHaveLength(0);
    expect(pickFinishedFasts([fast({ end_notified_at: '2026-10-06T12:01:00Z' })], now)).toHaveLength(0);
  });
  it('handles fractional goals and ignores malformed rows', () => {
    expect(pickFinishedFasts([fast({ target_hours: '14.5' })], at('2026-10-06T10:30:00Z'))).toHaveLength(1);
    expect(pickFinishedFasts([fast({ target_hours: '14.5' })], at('2026-10-06T10:29:00Z'))).toHaveLength(0);
    expect(pickFinishedFasts([fast({ started_at: 'nope' }), fast({ target_hours: null })], at('2030-01-01T00:00:00Z'))).toHaveLength(0);
    expect(pickFinishedFasts(null, 0)).toEqual([]);
  });
  it('returns only the finished ones from a mixed list', () => {
    const list = [fast({ id: 'a' }), fast({ id: 'b', started_at: '2026-10-06T10:00:00Z' })];
    expect(pickFinishedFasts(list, at('2026-10-06T13:00:00Z')).map((f) => f.id)).toEqual(['a']);
  });
});

describe('fastEndPayload', () => {
  it('names the goal and opens the fasting page', () => {
    expect(fastEndPayload(16)).toMatchObject({ title: 'Attune', url: '/fasting' });
    expect(fastEndPayload(16).body).toContain('16-hour');
    expect(fastEndPayload('14.5').body).toContain('14.5-hour');
  });
});
