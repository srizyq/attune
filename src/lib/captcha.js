// Bot check for the sign-up / sign-in calls, using Cloudflare Turnstile.
//
// OFF unless VITE_TURNSTILE_SITE_KEY is set: with no key every function here
// resolves to `undefined` and the auth calls are made exactly as before. To
// switch it on, create a Turnstile widget in Cloudflare, put its site key in
// VITE_TURNSTILE_SITE_KEY, and enable CAPTCHA protection in Supabase
// (Authentication → Attack Protection) with the matching secret — both sides
// must be on together, or sign-in breaks.
//
// The widget runs in "interaction-only" mode: invisible unless Cloudflare
// decides this visitor needs a challenge, in which case it appears in a small
// overlay.
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TIMEOUT_MS = 15000;

let scriptPromise;
function loadScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve(window.turnstile);
    el.onerror = () => { scriptPromise = undefined; reject(new Error('Could not load the bot check.')); };
    document.head.appendChild(el);
  });
  return scriptPromise;
}

export function captchaEnabled() {
  return !!import.meta.env.VITE_TURNSTILE_SITE_KEY;
}

// Resolves with a one-time token to pass as `captchaToken`, or `undefined`
// when the bot check is off.
export async function getCaptchaToken() {
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (!siteKey) return undefined;

  await loadScript();
  const turnstile = window.turnstile;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:1000;';
  document.body.appendChild(host);

  return new Promise((resolve, reject) => {
    let widgetId;
    const done = (fn, value) => {
      clearTimeout(timer);
      try { turnstile.remove(widgetId); } catch { /* already gone */ }
      host.remove();
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error('The bot check timed out. Try again.')), TIMEOUT_MS * 4);
    widgetId = turnstile.render(host, {
      sitekey: siteKey,
      appearance: 'interaction-only',
      callback: (token) => done(resolve, token),
      'error-callback': () => done(reject, new Error('The bot check failed. Try again.')),
    });
  });
}

// `{ options: { captchaToken } }` when there is a token, else nothing — so a
// disabled bot check leaves every auth call's arguments untouched.
export function captchaOptions(token) {
  return token ? { options: { captchaToken: token } } : {};
}
