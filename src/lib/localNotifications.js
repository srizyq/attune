// Notifications scheduled on the phone itself, inside the iOS app (the
// Capacitor shell around the website). Unlike web push they need no server and
// no Apple push account: the phone's own clock fires them, even with the app
// closed. They only exist in a build that includes @capacitor/local-notifications;
// in a browser, the installed web app or an older build every call is skipped.
//
// Everything is per device — the choices live in localStorage, not the profile.
// Because the phone fires them without running our code, the wording is fixed
// (nothing personalised); each one opens the screen it's about when tapped.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const STORAGE_KEY = 'attune.localNotifs';

// Every id we schedule sits in this range, so a re-sync can wipe exactly its
// own notifications and nothing else.
const ID_MIN = 1000;
const ID_MAX = 1499;

export const LOCAL_KEYS = ['daily', 'water', 'mood', 'recap', 'insights'];
export const DEFAULT_DAILY_TIME = '19:00';

const DEFAULTS = { daily: { on: false, time: DEFAULT_DAILY_TIME }, water: false, mood: false, recap: false, insights: false };

const WATER_HOURS = [10, 12, 14, 16, 18];
const SUNDAY = 1; // Capacitor weekdays: 1 = Sunday … 7 = Saturday
const WEDNESDAY = 4;
const SATURDAY = 7;

export function localNotificationsAvailable() {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');
  } catch {
    return false;
  }
}

export function getLocalPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    return {
      daily: { ...DEFAULTS.daily, ...(saved.daily || {}) },
      water: !!saved.water,
      mood: !!saved.mood,
      recap: !!saved.recap,
      insights: !!saved.insights,
    };
  } catch {
    return { ...DEFAULTS, daily: { ...DEFAULTS.daily } };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode: it just won't persist */ }
}

function parseTime(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  const hour = m ? Math.min(23, Number(m[1])) : 19;
  const minute = m ? Math.min(59, Number(m[2])) : 0;
  return { hour, minute };
}

// The list of notifications the phone should hold for these choices — pure, so
// it can be tested without a phone.
export function planFor(prefs) {
  const plan = [];
  if (prefs.daily?.on) {
    plan.push({
      id: 1000,
      title: 'Time to log your food',
      body: 'A quick log now keeps today accurate.',
      schedule: { on: parseTime(prefs.daily.time) },
      extra: { path: '/food' },
    });
  }
  if (prefs.water) {
    WATER_HOURS.forEach((hour, i) => plan.push({
      id: 1101 + i,
      title: 'Water break',
      body: 'Have a glass of water.',
      schedule: { on: { hour, minute: 0 } },
      extra: { path: '/dashboard' },
    }));
  }
  if (prefs.mood) {
    plan.push({
      id: 1200,
      title: 'How was your day?',
      body: 'One tap to log your mood and energy.',
      schedule: { on: { hour: 20, minute: 30 } },
      extra: { path: '/log' },
    });
  }
  if (prefs.recap) {
    plan.push({
      id: 1300,
      title: 'Your weekly recap is ready',
      body: 'See how your week went.',
      schedule: { on: { weekday: SUNDAY, hour: 18, minute: 0 } },
      extra: { path: '/expenditure' },
    });
  }
  if (prefs.insights) {
    [WEDNESDAY, SATURDAY].forEach((weekday, i) => plan.push({
      id: 1401 + i,
      title: 'Check your patterns',
      body: 'See what your logs say about how you feel.',
      schedule: { on: { weekday, hour: 12, minute: 30 } },
      extra: { path: '/expenditure' },
    }));
  }
  return plan;
}

const quiet = (promise) => Promise.resolve(promise).catch(() => {});

// Re-applies the saved choices: clears our notifications, schedules the plan.
export async function syncLocalNotifications() {
  if (!localNotificationsAvailable()) return;
  const { notifications } = await LocalNotifications.getPending().catch(() => ({ notifications: [] }));
  const ours = (notifications || []).filter((n) => n.id >= ID_MIN && n.id <= ID_MAX).map((n) => ({ id: n.id }));
  if (ours.length) await quiet(LocalNotifications.cancel({ notifications: ours }));
  const plan = planFor(getLocalPrefs());
  if (plan.length) await LocalNotifications.schedule({ notifications: plan });
}

async function ensurePermission() {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  if (current.display === 'denied') return false;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

// Turn one kind on or off (for 'daily', `value` is { on, time }). Asks iOS for
// permission the first time something is switched on; throws if it's refused.
export async function setLocalPref(key, value) {
  if (!localNotificationsAvailable()) throw new Error('These notifications work in the Attune iPhone app.');
  const turningOn = key === 'daily' ? value.on : value;
  if (turningOn && !(await ensurePermission())) {
    throw new Error('Notifications are turned off for Attune — allow them in Settings > Notifications.');
  }
  const prefs = getLocalPrefs();
  savePrefs({ ...prefs, [key]: key === 'daily' ? { ...prefs.daily, ...value } : value });
  await syncLocalNotifications();
}

// Run once at start-up: refresh what's scheduled, and open the right screen
// when a notification is tapped.
export function initLocalNotifications() {
  if (!localNotificationsAvailable()) return;
  quiet(syncLocalNotifications());
  quiet(LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const path = event?.notification?.extra?.path;
    if (typeof path !== 'string' || !path.startsWith('/')) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }));
}
