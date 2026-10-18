import { describe, it, expect } from 'vitest';
import { teamOwnerNotice, COACH_CAN_SEE, COACH_CAN_DO } from './coachAccess';
describe('teamOwnerNotice', () => {
  it('names the owner and the coach\'s team, and says what they cannot do', () => {
    expect(teamOwnerNotice('Olive Owner', "Mia's")).toBe("Olive Owner, who owns Mia's team, can also view this. They can't edit it or see your messages.");
  });
  it('reads fine without the coach\'s name', () => {
    expect(teamOwnerNotice('Olive Owner', null)).toContain('who owns their team');
  });
});

describe('what a coach can see', () => {
  it('lists each kind of thing once, with an icon and text', () => {
    for (const item of [...COACH_CAN_SEE, ...COACH_CAN_DO]) {
      expect(item.icon).toMatch(/^ti-/);
      expect(item.text.length).toBeGreaterThan(5);
    }
    expect(new Set(COACH_CAN_SEE.map((i) => i.text)).size).toBe(COACH_CAN_SEE.length);
  });
});
