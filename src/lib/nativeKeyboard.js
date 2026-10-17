// The on-screen keyboard inside the iOS app (the Capacitor shell around the
// website). Three things the website alone cannot do:
//   - hide the grey bar iOS draws above the keyboard (arrows + tick),
//   - resize the web view when the keyboard opens, so a full-screen page ends
//     right where the keyboard starts instead of being panned up and leaving a
//     gap (the bug on the scan pages),
//   - draw the keyboard dark or light to match the app's theme.
// All of it goes through the official @capacitor/keyboard plugin, which only
// exists in a freshly built app; everywhere else (a browser, an older build)
// every call is skipped and the page behaves as before.
import { Capacitor } from '@capacitor/core';
import { Keyboard, KeyboardResize, KeyboardStyle } from '@capacitor/keyboard';

function available() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Keyboard');
  } catch {
    return false;
  }
}

const quiet = (promise) => Promise.resolve(promise).catch(() => {});

export function initNativeKeyboard() {
  if (!available()) return;
  const html = document.documentElement;
  quiet(Keyboard.setAccessoryBarVisible({ isVisible: false }));
  quiet(Keyboard.setResizeMode({ mode: KeyboardResize.Native }));
  // While the keyboard is up the bottom nav and + button would sit on top of
  // it, so CSS hides them (.kb-open in appshell.css).
  quiet(Keyboard.addListener('keyboardWillShow', (info) => {
    html.classList.add('kb-open');
    html.style.setProperty('--kb-h', `${info?.keyboardHeight || 0}px`);
  }));
  quiet(Keyboard.addListener('keyboardDidHide', () => {
    html.classList.remove('kb-open');
    html.style.removeProperty('--kb-h');
  }));
}

export function setNativeKeyboardTheme(theme) {
  if (!available()) return;
  quiet(Keyboard.setStyle({ style: theme === 'light' ? KeyboardStyle.Light : KeyboardStyle.Dark }));
}
