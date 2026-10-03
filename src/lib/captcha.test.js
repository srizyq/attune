// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCaptchaToken, captchaOptions, captchaEnabled } from './captcha';

afterEach(() => { vi.unstubAllEnvs(); delete window.turnstile; });

describe('captcha (bot check)', () => {
  it('is off without a site key: no token, no script, auth calls unchanged', async () => {
    expect(captchaEnabled()).toBe(false);
    expect(await getCaptchaToken()).toBeUndefined();
    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
    expect(captchaOptions(undefined)).toEqual({});
  });

  it('wraps a token in the shape Supabase expects', () => {
    expect(captchaOptions('tok')).toEqual({ options: { captchaToken: 'tok' } });
  });

  it('returns the token the widget produces when a site key is set', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    window.turnstile = {
      render: vi.fn((_host, opts) => { queueMicrotask(() => opts.callback('widget-token')); return 'w1'; }),
      remove: vi.fn(),
    };
    expect(await getCaptchaToken()).toBe('widget-token');
    expect(window.turnstile.render).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ sitekey: 'site-key', appearance: 'interaction-only' }));
    expect(window.turnstile.remove).toHaveBeenCalledWith('w1');
  });

  it('rejects when the widget reports an error', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'site-key');
    window.turnstile = { render: vi.fn((_h, opts) => { queueMicrotask(() => opts['error-callback']()); return 'w2'; }), remove: vi.fn() };
    await expect(getCaptchaToken()).rejects.toThrow(/failed/);
  });
});
