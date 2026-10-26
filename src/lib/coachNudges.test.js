import { describe, it, expect } from 'vitest';
import { nudgeFor, QUICK_MESSAGES, quickMessageText } from './coachNudges.js';
import { attentionFlags } from './clientInsights.js';

describe('nudgeFor', () => {
  it('opens with the client\'s first name', () => {
    expect(nudgeFor('inactive', 'Maya Patel')).toMatch(/^Hi Maya — /);
    expect(nudgeFor('inactive', '   ')).toMatch(/^Hi — /);
    expect(nudgeFor('inactive')).toMatch(/^Hi — /);
  });

  it('is specific to why the coach is reaching out', () => {
    expect(nudgeFor('inactive', 'Sam')).toMatch(/haven't seen anything logged/);
    expect(nudgeFor('weight-stalled', 'Sam')).toMatch(/weight has been steady/);
    expect(nudgeFor('partial-days', 'Sam')).toMatch(/partly logged/);
    expect(nudgeFor('targets-changed', 'Sam')).toMatch(/changed your own targets/);
  });

  it('falls back to a plain check-in for a reason it does not know', () => {
    expect(nudgeFor('something-new', 'Sam')).toBe('Hi Sam — just checking in. How\'s the week going?');
  });

  it('has a draft for every reason a client can be flagged — none forgotten when a flag is added', () => {
    const base = { goal: 'lose', pace_kg_per_week: 0.5, calorie_target: 2000, protein_g: 150, connected_at: '2026-08-01T00:00:00Z' };
    const seen = new Set();
    const collect = (s) => attentionFlags({ ...base, ...s }, '2026-10-16').forEach((f) => seen.add(f.id));
    collect({ last_log_date: '2026-10-10', days_logged_7d: 1 });                                  // inactive
    collect({ last_log_date: null, days_logged_7d: 0 });                                          // never logged
    collect({ last_log_date: '2026-10-15', days_logged_7d: 2 });                                  // low logging
    collect({ last_log_date: '2026-10-16', days_logged_7d: 6, days_complete_7d: 1, days_judged_7d: 6, days_on_target_7d: 1 }); // partial + off target
    collect({ last_log_date: '2026-10-16', days_logged_7d: 7, weight_rate_kg_week: -0.02 });       // stalled
    collect({ last_log_date: '2026-10-16', days_logged_7d: 7, weight_rate_kg_week: 0.4 });         // wrong way
    collect({ last_log_date: '2026-10-16', days_logged_7d: 7, goal: 'maintain', weight_rate_kg_week: 0.6 }); // drifting
    collect({ last_log_date: '2026-10-16', days_logged_7d: 7, targets_overridden_at: '2026-10-15T00:00:00Z' }); // changed targets
    expect(seen.size).toBeGreaterThanOrEqual(9);
    for (const id of seen) expect(nudgeFor(id, 'Sam'), id).not.toMatch(/just checking in/); // each has its own wording, not the fallback
  });
});

describe('quick messages', () => {
  it('each is a draft that addresses the client by name', () => {
    for (const q of QUICK_MESSAGES) expect(q.text('Maya Patel'), q.id).toMatch(/^Hi Maya — /);
  });
  it('are looked up by id, and an unknown id is empty rather than an error', () => {
    expect(quickMessageText('praise', 'Sam')).toBe('Hi Sam — great work this week. Keep it up!');
    expect(quickMessageText('nope', 'Sam')).toBe('');
  });
  it('have distinct ids and labels', () => {
    expect(new Set(QUICK_MESSAGES.map((q) => q.id)).size).toBe(QUICK_MESSAGES.length);
    expect(new Set(QUICK_MESSAGES.map((q) => q.label)).size).toBe(QUICK_MESSAGES.length);
  });
});
