import { describe, it, expect } from 'vitest';
import { detectInstallEnvironment, shouldShowInstallPrompt, recordVisitDay, DISMISS_DAYS, VISITS_KEY } from './installPrompt';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';

describe('detectInstallEnvironment', () => {
  it('recognises an installed home-screen app', () => {
    expect(detectInstallEnvironment({ userAgent: IPHONE_SAFARI, standalone: true })).toBe('installed');
    expect(detectInstallEnvironment({ userAgent: ANDROID, displayStandalone: true })).toBe('installed');
  });
  it('treats iPhone Safari and iPhone Chrome as manual-install iOS', () => {
    expect(detectInstallEnvironment({ userAgent: IPHONE_SAFARI })).toBe('ios');
    expect(detectInstallEnvironment({ userAgent: IPHONE_CHROME })).toBe('ios');
  });
  it('recognises iPadOS, which reports itself as a Mac', () => {
    expect(detectInstallEnvironment({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios');
    expect(detectInstallEnvironment({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe('other');
  });
  it('gives up inside in-app browsers that have no Add to Home Screen', () => {
    expect(detectInstallEnvironment({ userAgent: IPHONE_INSTAGRAM })).toBe('other');
  });
  it('treats Android and desktop as other', () => {
    expect(detectInstallEnvironment({ userAgent: ANDROID })).toBe('other');
    expect(detectInstallEnvironment({})).toBe('other');
  });
});

describe('shouldShowInstallPrompt', () => {
  const now = Date.parse('2026-10-10T00:00:00Z');
  const base = { env: 'ios', visitDays: 3, now };
  it('shows to an iPhone user who has been around a few days', () => {
    expect(shouldShowInstallPrompt(base)).toBe(true);
  });
  it('never shows once installed', () => {
    expect(shouldShowInstallPrompt({ ...base, env: 'installed' })).toBe(false);
  });
  it('does not greet a brand-new user with it', () => {
    expect(shouldShowInstallPrompt({ ...base, visitDays: 1 })).toBe(false);
  });
  it('only shows elsewhere when the browser can actually install', () => {
    expect(shouldShowInstallPrompt({ ...base, env: 'other' })).toBe(false);
    expect(shouldShowInstallPrompt({ ...base, env: 'other', nativePromptAvailable: true })).toBe(true);
  });
  it('stays away for a while after being dismissed, then returns', () => {
    const dismissed = (days) => new Date(now - days * 86_400_000).toISOString();
    expect(shouldShowInstallPrompt({ ...base, dismissedAt: dismissed(DISMISS_DAYS - 1) })).toBe(false);
    expect(shouldShowInstallPrompt({ ...base, dismissedAt: dismissed(DISMISS_DAYS + 1) })).toBe(true);
  });
  it('treats a garbled dismissal timestamp as never dismissed', () => {
    expect(shouldShowInstallPrompt({ ...base, dismissedAt: 'nonsense' })).toBe(true);
  });
});

describe('recordVisitDay', () => {
  const fakeStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };
  it('counts distinct days only', () => {
    const s = fakeStorage();
    expect(recordVisitDay(s, '2026-10-01')).toBe(1);
    expect(recordVisitDay(s, '2026-10-01')).toBe(1);
    expect(recordVisitDay(s, '2026-10-02')).toBe(2);
  });
  it('survives corrupt stored data', () => {
    const s = fakeStorage();
    s.setItem(VISITS_KEY, '{not json');
    expect(recordVisitDay(s, '2026-10-01')).toBe(0);
  });
  it('survives storage that throws', () => {
    const s = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(recordVisitDay(s, '2026-10-01')).toBe(0);
  });
});
