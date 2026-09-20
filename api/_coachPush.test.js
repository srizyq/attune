import { describe, it, expect } from 'vitest';
import { firstName, replyPayload, digestPayload, withinThrottle, pickInactive, digestDue, checkinPayload, pickDueForms, withinWakingHours } from './_coachPush.js';

describe('replyPayload', () => {
  it('names the client but never includes what they wrote', () => {
    expect(replyPayload('Sam Client')).toEqual({ title: 'Attune', body: 'Sam sent you a message', url: '/coach' });
  });
  it('copes with missing or blank names', () => {
    expect(replyPayload(null).body).toBe('A client sent you a message');
    expect(replyPayload('   ').body).toBe('A client sent you a message');
  });
});

describe('firstName', () => {
  it('takes the first word and falls back when there is none', () => {
    expect(firstName('  Ana  Maria ', 'x')).toBe('Ana');
    expect(firstName('', 'fallback')).toBe('fallback');
    expect(firstName(undefined, 'fallback')).toBe('fallback');
  });
});

describe('digestPayload', () => {
  it('pluralises', () => {
    expect(digestPayload(1, 3).body).toBe("1 client hasn't logged in 3+ days");
    expect(digestPayload(4, 3).body).toBe("4 clients haven't logged in 3+ days");
    expect(digestPayload(4, 3).url).toBe('/coach');
  });
});

describe('withinThrottle', () => {
  const t = (s) => `2026-09-20T10:00:${String(s).padStart(2, '0')}Z`;
  it('notifies for the first message of a burst', () => {
    expect(withinThrottle([t(30)])).toBe(false);
    expect(withinThrottle([])).toBe(false);
  });
  it('suppresses a follow-up inside the window, not one after it', () => {
    expect(withinThrottle([t(30), t(10)])).toBe(true);
    expect(withinThrottle(['2026-09-20T10:05:00Z', '2026-09-20T10:00:00Z'])).toBe(false);
    expect(withinThrottle(['2026-09-20T10:02:00Z', '2026-09-20T10:00:00Z'])).toBe(false); // exactly 2 minutes: notify
  });
  it('errs towards notifying on bad data', () => {
    expect(withinThrottle(['nope', t(1)])).toBe(false);
    expect(withinThrottle(null)).toBe(false);
  });
});

describe('pickInactive', () => {
  const today = '2026-09-20';
  const links = [
    { client_id: 'fresh', created_at: '2026-09-19T00:00:00Z' },
    { client_id: 'stale', created_at: '2026-08-01T00:00:00Z' },
    { client_id: 'today', created_at: '2026-08-01T00:00:00Z' },
    { client_id: 'edge', created_at: '2026-08-01T00:00:00Z' },
    { client_id: 'never-old', created_at: '2026-09-10T00:00:00Z' },
    { client_id: 'never-new', created_at: '2026-09-19T00:00:00Z' },
  ];
  const last = { fresh: '2026-09-19', stale: '2026-09-10', today: '2026-09-20', edge: '2026-09-17' };
  it('flags those quiet for the threshold or longer', () => {
    expect(pickInactive(links, last, today, 3).map(l => l.client_id)).toEqual(['stale', 'edge', 'never-old']);
  });
  it('measures never-logged clients from when they connected', () => {
    expect(pickInactive(links, {}, today, 3).map(l => l.client_id)).toEqual(['stale', 'today', 'edge', 'never-old']);
  });
  it('handles no clients and a custom threshold', () => {
    expect(pickInactive([], {}, today)).toEqual([]);
    expect(pickInactive(undefined, undefined, today)).toEqual([]);
    expect(pickInactive(links, last, today, 10).map(l => l.client_id)).toEqual(['stale', 'never-old']);
    expect(pickInactive(links, last, today, 11)).toEqual([]);
  });
  it('ignores rows with unusable dates rather than flagging or crashing', () => {
    expect(pickInactive([{ client_id: 'x', created_at: 'garbage' }], {}, today)).toEqual([]);
  });
});

describe('digestDue', () => {
  it('waits for 09:00 local and sends once per local day', () => {
    expect(digestDue('08:59', null, '2026-09-20')).toBe(false);
    expect(digestDue('09:00', null, '2026-09-20')).toBe(true);
    expect(digestDue('14:00', '2026-09-19', '2026-09-20')).toBe(true);
    expect(digestDue('14:00', '2026-09-20', '2026-09-20')).toBe(false);
  });
});

describe('checkinPayload', () => {
  it('names the coach and nothing else', () => {
    expect(checkinPayload('Jordan Lee')).toEqual({ title: 'Attune', body: 'Jordan sent you a check-in', url: '/coach' });
    expect(checkinPayload(null).body).toBe('Your coach sent you a check-in');
  });
});

describe('pickDueForms', () => {
  const day = 86400000;
  const now = Date.parse('2026-09-20T12:00:00Z');
  const iso = (msAgo) => new Date(now - msAgo).toISOString();
  const form = (id, over = {}) => ({ id, cadence_days: 7, created_at: iso(30 * day), last_notified_at: null, ...over });

  it('picks a form that has never been answered as soon as it exists', () => {
    expect(pickDueForms([form('a', { created_at: iso(1000) })], {}, now).map(f => f.id)).toEqual(['a']);
  });
  it('waits the full cadence after the last answer', () => {
    const forms = [form('due'), form('early')];
    const last = { due: iso(7 * day), early: iso(6 * day) };
    expect(pickDueForms(forms, last, now).map(f => f.id)).toEqual(['due']);
  });
  it('does not re-ping a form already nudged for this due date, but does for the next cycle', () => {
    const last = { a: iso(8 * day) };                                   // due since 1 day ago
    expect(pickDueForms([form('a', { last_notified_at: iso(1000) })], last, now)).toEqual([]);
    expect(pickDueForms([form('a', { last_notified_at: iso(20 * day) })], last, now).map(f => f.id)).toEqual(['a']); // notified in an earlier cycle
    expect(pickDueForms([form('a', { last_notified_at: iso(1000) })], { a: iso(1000) }, now)).toEqual([]);          // just answered, not due
  });
  it('notifies again the next cycle after answering', () => {
    const f = form('a', { last_notified_at: iso(9 * day) });
    expect(pickDueForms([f], { a: iso(7 * day + 1000) }, now).map(x => x.id)).toEqual(['a']);
  });
  it('honours each form\'s own cadence', () => {
    expect(pickDueForms([form('m', { cadence_days: 30 })], { m: iso(10 * day) }, now)).toEqual([]);
    expect(pickDueForms([form('m', { cadence_days: 30 })], { m: iso(31 * day) }, now).map(f => f.id)).toEqual(['m']);
  });
  it('ignores garbage dates and empty input', () => {
    expect(pickDueForms([form('x', { created_at: 'garbage' })], {}, now)).toEqual([]);
    expect(pickDueForms(undefined, undefined, now)).toEqual([]);
  });
});

describe('withinWakingHours', () => {
  it('is 08:00 to 21:00 inclusive', () => {
    expect(['07:59', '08:00', '12:30', '21:00', '21:01', '03:00'].map(withinWakingHours)).toEqual([false, true, true, true, false, false]);
  });
});

