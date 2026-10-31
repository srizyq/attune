// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { planFor, getLocalPrefs, localNotificationsAvailable, LOCAL_KEYS } from './localNotifications.js';

const off = { daily: { on: false, time: '19:00' }, water: false, mood: false, recap: false, insights: false };

describe('planFor', () => {
  it('schedules nothing when everything is off', () => {
    expect(planFor(off)).toEqual([]);
  });

  it('turns the daily reminder into one notification at its time', () => {
    const plan = planFor({ ...off, daily: { on: true, time: '07:45' } });
    expect(plan).toHaveLength(1);
    expect(plan[0].schedule).toEqual({ on: { hour: 7, minute: 45 } });
  });

  it('falls back to 19:00 for an unreadable daily time', () => {
    const plan = planFor({ ...off, daily: { on: true, time: '' } });
    expect(plan[0].schedule.on).toEqual({ hour: 19, minute: 0 });
  });

  it('spreads water reminders through the day', () => {
    const plan = planFor({ ...off, water: true });
    expect(plan.map((n) => n.schedule.on.hour)).toEqual([10, 12, 14, 16, 18]);
  });

  it('puts the recap on Sunday evening and insights on Wednesday and Saturday', () => {
    expect(planFor({ ...off, recap: true })[0].schedule.on).toMatchObject({ weekday: 1, hour: 18 });
    expect(planFor({ ...off, insights: true }).map((n) => n.schedule.on.weekday)).toEqual([4, 7]);
  });

  it('gives every notification a unique id inside the range a re-sync clears', () => {
    const plan = planFor({ daily: { on: true, time: '19:00' }, water: true, mood: true, recap: true, insights: true });
    const ids = plan.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id >= 1000 && id <= 1499).toBe(true);
  });

  it('only opens in-app paths when tapped', () => {
    const plan = planFor({ daily: { on: true, time: '19:00' }, water: true, mood: true, recap: true, insights: true });
    for (const n of plan) expect(n.extra.path.startsWith('/')).toBe(true);
  });
});

describe('getLocalPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults everything to off', () => {
    const prefs = getLocalPrefs();
    expect(Object.keys(prefs).sort()).toEqual([...LOCAL_KEYS].sort());
    expect(prefs.daily.on).toBe(false);
    expect(prefs.water).toBe(false);
  });

  it('survives corrupt saved data', () => {
    localStorage.setItem('attune.localNotifs', '{not json');
    expect(getLocalPrefs().mood).toBe(false);
  });
});

describe('localNotificationsAvailable', () => {
  it('is false in a browser', () => {
    expect(localNotificationsAvailable()).toBe(false);
  });
});
