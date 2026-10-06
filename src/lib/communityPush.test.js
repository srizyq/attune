// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const save = vi.fn();
const subscribe = vi.fn();
const ask = vi.fn();
let supported = true;
vi.mock('./db', () => ({ savePushSubscription: (...a) => save(...a) }));
vi.mock('./pushNotifications', () => ({
  pushSupported: () => supported,
  requestNotificationPermission: () => ask(),
  subscribeToPush: () => subscribe(),
}));
const { askForCommunityPush, ensureCommunityPush, forgetCommunityPush } = await import('./communityPush.js');

const setPermission = (p) => { globalThis.Notification = { permission: p }; };
beforeEach(() => {
  save.mockReset(); subscribe.mockReset(); ask.mockReset(); forgetCommunityPush(); supported = true;
  subscribe.mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push.test/1' }) });
});

describe('askForCommunityPush', () => {
  it('asks permission, then registers this phone', async () => {
    setPermission('default'); ask.mockResolvedValue('granted');
    expect(await askForCommunityPush('u1')).toBe('granted');
    expect(save).toHaveBeenCalledWith('u1', { endpoint: 'https://push.test/1' });
  });
  it('does not register when permission is refused', async () => {
    setPermission('default'); ask.mockResolvedValue('denied');
    expect(await askForCommunityPush('u1')).toBe('denied');
    expect(save).not.toHaveBeenCalled();
  });
  it('does not ask again once permission was given', async () => {
    setPermission('granted');
    expect(await askForCommunityPush('u1')).toBe('granted');
    expect(ask).not.toHaveBeenCalled();
  });
  it('says so when push is not supported, or fails', async () => {
    setPermission('granted'); supported = false;
    expect(await askForCommunityPush('u1')).toBe('unsupported');
    supported = true; save.mockRejectedValue(new Error('x'));
    expect(await askForCommunityPush('u1')).toBe('error');
  });
});

describe('ensureCommunityPush', () => {
  it('quietly registers once per visit when permission is already granted', async () => {
    setPermission('granted');
    await ensureCommunityPush('u1'); await ensureCommunityPush('u1');
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('never prompts or registers without permission', async () => {
    setPermission('default');
    await ensureCommunityPush('u1');
    expect(ask).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
