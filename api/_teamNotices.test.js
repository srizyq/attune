import { describe, it, expect, vi } from 'vitest';
import { teamNoticeEmail, processTeamNotices } from './_teamNotices.js';

const NAMES = { c1: 'Kai Client', o1: 'Olive Owner', t1: 'Mia Mate' };
const store = (pending, { email = 'kai@example.test' } = {}) => ({
  pending: vi.fn(async () => pending),
  emailOf: vi.fn(async () => email),
  names: vi.fn(async () => NAMES),
  markEmailed: vi.fn(async () => {}),
});
const notice = { client_id: 'c1', owner_id: 'o1', trainer_id: 't1' };

describe('the email', () => {
  it('says who can see what, what they cannot, and how to end it', () => {
    const e = teamNoticeEmail({ clientName: 'Kai Client', coachName: 'Mia Mate', ownerName: 'Olive Owner', appUrl: 'https://attun3.com' });
    expect(e.subject).toContain("Mia Mate's team");
    expect(e.text).toContain('Hi Kai,');
    expect(e.text).toContain('Olive Owner');
    expect(e.text).toContain('food log');
    expect(e.text).toContain('cannot see your messages with Mia Mate');
    expect(e.text).toContain("private notes");
    expect(e.text).toContain('disconnecting from Mia Mate');
    expect(e.text).toContain('https://attun3.com');
  });
  it('copes with missing names', () => {
    expect(teamNoticeEmail({}).text).toContain('Hi there,');
  });
});

describe('processTeamNotices', () => {
  it('sends each notice and marks it', async () => {
    const s = store([notice]);
    const sendEmail = vi.fn(async () => true);
    const r = await processTeamNotices({ store: s, sendEmail, appUrl: 'https://attun3.com', now: 1000 });
    expect(r).toEqual({ checked: 1, sent: 1 });
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'kai@example.test', text: expect.stringContaining('Olive Owner') }));
    expect(s.markEmailed).toHaveBeenCalledWith('c1', 'o1', 1000);
  });
  it('does not mark a notice whose email failed, so it is retried', async () => {
    const s = store([notice]);
    const r = await processTeamNotices({ store: s, sendEmail: async () => false });
    expect(r).toEqual({ checked: 1, sent: 0 });
    expect(s.markEmailed).not.toHaveBeenCalled();
  });
  it('does nothing, and marks nothing, when no email key is set', async () => {
    const s = store([notice]);
    const r = await processTeamNotices({ store: s, sendEmail: null });
    expect(r).toEqual({ checked: 1, sent: 0 });
    expect(s.markEmailed).not.toHaveBeenCalled();
  });
  it('closes a notice for someone with no email address (they still see it in the app)', async () => {
    const s = store([notice], { email: null });
    const sendEmail = vi.fn(async () => true);
    expect(await processTeamNotices({ store: s, sendEmail })).toEqual({ checked: 1, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(s.markEmailed).toHaveBeenCalled();
  });
  it('is a no-op with nothing queued', async () => {
    expect(await processTeamNotices({ store: store([]), sendEmail: async () => true })).toEqual({ checked: 0, sent: 0 });
  });
  it('asks for at most the limit', async () => {
    const s = store([]);
    await processTeamNotices({ store: s, sendEmail: async () => true, limit: 7 });
    expect(s.pending).toHaveBeenCalledWith(7);
  });
});
