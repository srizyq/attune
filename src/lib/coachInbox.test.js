// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { countUnread, messageKind, relativeLabel, getSeenAt, setSeenAt } from './coachInbox';

const msg = (id, created_at, extra = {}) => ({ id, created_at, category: 'general', ...extra });

describe('countUnread', () => {
  const list = [msg(3, '2026-10-09T10:00:00Z'), msg(2, '2026-10-08T10:00:00Z'), msg(1, '2026-10-01T10:00:00Z')];

  it('counts everything when nothing has been seen yet', () => {
    expect(countUnread(list, null)).toBe(3);
  });
  it('counts only messages newer than the last seen time', () => {
    expect(countUnread(list, '2026-10-08T10:00:00Z')).toBe(1);
    expect(countUnread(list, '2026-10-09T10:00:00Z')).toBe(0);
  });
  it('is zero for an empty list', () => {
    expect(countUnread([], null)).toBe(0);
  });
});

describe('messageKind', () => {
  it('labels and routes each category', () => {
    expect(messageKind(msg(1, 'x', { category: 'weight' }))).toEqual({ label: 'Weight', target: 'weight' });
    expect(messageKind(msg(1, 'x', { category: 'nutrition', comment_date: '2026-10-08' }))).toEqual({ label: 'Food', target: 'food' });
    expect(messageKind(msg(1, 'x', { category: 'general' }))).toEqual({ label: 'General', target: 'chat' });
  });
  it('treats a nutrition note with no date as a general one (nowhere to jump to)', () => {
    expect(messageKind(msg(1, 'x', { category: 'nutrition', comment_date: null })).target).toBe('chat');
  });
});

describe('relativeLabel', () => {
  const now = new Date('2026-10-10T12:00:00Z').getTime();
  it('reads naturally', () => {
    expect(relativeLabel('2026-10-10T08:00:00Z', now)).toBe('today');
    expect(relativeLabel('2026-10-09T08:00:00Z', now)).toBe('yesterday');
    expect(relativeLabel('2026-10-07T08:00:00Z', now)).toBe('3 days ago');
  });
});

describe('seen storage', () => {
  beforeEach(() => localStorage.clear());
  it('remembers per user', () => {
    expect(getSeenAt('u1')).toBeNull();
    setSeenAt('u1', '2026-10-09T10:00:00Z');
    expect(getSeenAt('u1')).toBe('2026-10-09T10:00:00Z');
    expect(getSeenAt('u2')).toBeNull();
  });
});
