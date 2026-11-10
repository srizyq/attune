// Feeds the iOS home-screen widget and receives its taps. The widget can't read
// the app's data itself, so the app pushes a small snapshot into a shared App
// Group (native plugin "WidgetBridge", see ios/App/App/SceneDelegate.swift).
// Everywhere that plugin isn't present (browser, older app build) every call is
// skipped, and nothing here may ever throw.
import { Capacitor, registerPlugin } from '@capacitor/core';

const WidgetBridge = registerPlugin('WidgetBridge');

function available() {
  try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('WidgetBridge'); } catch { return false; }
}

const whole = (n) => Math.max(0, Math.round(Number(n) || 0));

// What the widget shows, from the dashboard's own numbers.
export function buildSnapshot({ calorieTarget, consumed, protein, carbs, fat, targets, fast }) {
  const running = fast && fast.started_at && !fast.ended_at;
  return {
    caloriesLeft: whole((calorieTarget || 0) - (consumed || 0)),
    calorieGoal: whole(calorieTarget),
    proteinLeft: whole((targets?.protein || 0) - (protein || 0)),
    carbsLeft: whole((targets?.carbs || 0) - (carbs || 0)),
    fatLeft: whole((targets?.fat || 0) - (fat || 0)),
    fastStart: running ? new Date(fast.started_at).getTime() / 1000 : 0,
    fastTargetHours: running ? Number(fast.target_hours) || 16 : 16,
  };
}

export function pushWidgetSnapshot(snapshot) {
  if (!available()) return;
  Promise.resolve(WidgetBridge.setSnapshot(snapshot)).catch(() => {});
}

export function clearWidgetSnapshot() {
  pushWidgetSnapshot(buildSnapshot({}));
}

// Calls handler('water') / handler('dashboard') for a tap on the widget, whether
// the app was already open or was launched by the tap. Returns an unsubscribe.
export function listenForWidgetLinks(handler) {
  if (!available()) return () => {};
  const fire = (url) => {
    try {
      const host = new URL(url).hostname;
      if (host) handler(host);
    } catch { /* not a URL we understand */ }
  };
  let handle = null;
  let gone = false;
  Promise.resolve(WidgetBridge.addListener('urlOpen', (e) => fire(e?.url))).then((h) => { if (gone) h?.remove?.(); else handle = h; }).catch(() => {});
  Promise.resolve(WidgetBridge.consumePendingUrl()).then((r) => { if (r?.url) fire(r.url); }).catch(() => {});
  return () => { gone = true; handle?.remove?.(); };
}
