import { describe, it, expect } from 'vitest';
import { buildAccessRecord } from './coachAccessRecord.js';

const link = { id: 'l1', created_at: '2026-10-01T02:00:00Z', consented_at: '2026-10-01T02:05:00Z', trainer: { id: 'coach-1', name: 'Jordan Lee' } };
const ids = (r) => r.map((e) => e.id);

describe('buildAccessRecord', () => {
  it('lists the connection and the client\'s consent, newest first', () => {
    const r = buildAccessRecord({ link, profile: {}, coachName: 'Jordan Lee' });
    expect(ids(r)).toEqual(['consented', 'connected']);
    expect(r[1].text).toBe('Connected with Jordan Lee');
    expect(r[0].text).toBe('You accepted what they can see and do');
  });

  it('adds when the coach set the targets, only if it was this coach', () => {
    const mine = buildAccessRecord({ link, profile: { targets_set_by: 'coach-1', targets_set_at: '2026-10-12T02:00:00Z' }, coachName: 'Jordan Lee' });
    expect(ids(mine)).toEqual(['targets-set', 'consented', 'connected']);
    expect(mine[0].text).toBe('Jordan Lee set your calorie and macro targets');
    const other = buildAccessRecord({ link, profile: { targets_set_by: 'someone-else', targets_set_at: '2026-10-12T02:00:00Z' }, coachName: 'Jordan Lee' });
    expect(ids(other)).not.toContain('targets-set');
  });

  it('adds when the client took the targets back, in date order with the rest', () => {
    const r = buildAccessRecord({ link, profile: { targets_set_by: null, targets_set_at: '2026-10-12T02:00:00Z', targets_overridden_at: '2026-10-14T05:00:00Z' }, coachName: 'Jordan Lee' });
    expect(ids(r)).toEqual(['targets-taken', 'consented', 'connected']);
  });

  it('is honest about a connection from before consent was recorded', () => {
    const r = buildAccessRecord({ link: { ...link, consented_at: null }, profile: {}, coachName: 'Jordan Lee' });
    expect(ids(r)).toEqual(['connected', 'no-consent']);
    expect(r[1].dateLabel).toBe('—');
  });

  it('has nothing for no connection', () => {
    expect(buildAccessRecord({ link: null, profile: {} })).toEqual([]);
  });
});
