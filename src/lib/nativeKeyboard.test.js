// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const keyboard = vi.hoisted(() => ({
  setAccessoryBarVisible: vi.fn().mockResolvedValue(undefined),
  setResizeMode: vi.fn().mockResolvedValue(undefined),
  setStyle: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn().mockResolvedValue({ remove: () => {} }),
}));
const cap = vi.hoisted(() => ({ native: false, plugin: true }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => cap.native, isPluginAvailable: () => cap.plugin },
}));
vi.mock('@capacitor/keyboard', () => ({
  Keyboard: keyboard,
  KeyboardResize: { Native: 'native' },
  KeyboardStyle: { Dark: 'DARK', Light: 'LIGHT' },
}));

import { initNativeKeyboard, setNativeKeyboardTheme } from './nativeKeyboard';

beforeEach(() => {
  Object.values(keyboard).forEach((f) => f.mockClear());
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

describe('outside the iOS app (a browser, or an older build without the plugin)', () => {
  it('does nothing at all', () => {
    cap.native = false;
    initNativeKeyboard();
    setNativeKeyboardTheme('light');
    cap.native = true; cap.plugin = false;
    initNativeKeyboard();
    setNativeKeyboardTheme('dark');
    Object.values(keyboard).forEach((f) => expect(f).not.toHaveBeenCalled());
  });
});

describe('inside the iOS app', () => {
  beforeEach(() => { cap.native = true; cap.plugin = true; });

  it('hides the accessory bar and resizes the web view with the keyboard', () => {
    initNativeKeyboard();
    expect(keyboard.setAccessoryBarVisible).toHaveBeenCalledWith({ isVisible: false });
    expect(keyboard.setResizeMode).toHaveBeenCalledWith({ mode: 'native' });
  });

  it('marks the page while the keyboard is open, with its height', () => {
    initNativeKeyboard();
    const on = (name) => keyboard.addListener.mock.calls.find((c) => c[0] === name)[1];
    on('keyboardWillShow')({ keyboardHeight: 336 });
    expect(document.documentElement.classList.contains('kb-open')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--kb-h')).toBe('336px');
    on('keyboardDidHide')();
    expect(document.documentElement.classList.contains('kb-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--kb-h')).toBe('');
  });

  it('draws the keyboard to match the theme', () => {
    setNativeKeyboardTheme('light');
    expect(keyboard.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
    setNativeKeyboardTheme('dark');
    expect(keyboard.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
  });

  it('survives the plugin rejecting a call', async () => {
    keyboard.setStyle.mockRejectedValueOnce(new Error('not implemented'));
    expect(() => setNativeKeyboardTheme('light')).not.toThrow();
    await Promise.resolve();
  });
});
