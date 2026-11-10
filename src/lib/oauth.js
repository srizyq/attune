import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

// Inside the iOS app the page runs in an embedded web view, where Google refuses
// browser-style sign-in (disallowed_useragent) and Apple's sheet isn't available.
// There the system's own Google / Apple dialogs are used instead, and the identity
// token they return is exchanged with Supabase directly.
export const isNativeApp = () => Capacitor.isNativePlatform();

const APPLE_CLIENT_ID = 'com.sriram.attune'; // the app's bundle id; unused by iOS itself

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

let nativeReady = null;
async function nativePlugin() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  nativeReady ??= SocialLogin.initialize({
    apple: { clientId: APPLE_CLIENT_ID },
    google: {
      iOSClientId: import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID,
      iOSServerClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
      mode: 'online',
    },
  });
  await nativeReady;
  return SocialLogin;
}

// Returns the same { error } shape as the browser redirect flow. On success the
// session is set in place (no redirect), so callers move on themselves.
async function nativeSignIn(provider) {
  try {
    const SocialLogin = await nativePlugin();
    // Supabase wants the raw nonce; the provider signs its SHA-256 into the token.
    const rawNonce = crypto.randomUUID();
    const hashedNonce = await sha256Hex(rawNonce);
    const res = await SocialLogin.login({
      provider,
      options: provider === 'apple'
        ? { scopes: ['email', 'name'], nonce: hashedNonce }
        : { scopes: ['email', 'profile'], nonce: hashedNonce },
    });
    const idToken = res?.result?.idToken;
    if (!idToken) return { error: new Error('Sign-in did not return an identity token.') };
    const { error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce: rawNonce });
    return { error };
  } catch (err) {
    // Backing out of the system dialog is not an error worth showing.
    if (/cancel/i.test(String(err?.message ?? err)) || err?.code === '1001') return { error: null, cancelled: true };
    return { error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// Where the provider sends people back to. Both entry points land on a page
// that already knows what to do with a freshly signed-in session: Login
// routes returning accounts to the dashboard (and brand-new ones into
// onboarding), Step4 finishes the guest-to-real upgrade. Like
// emailRedirectTo, each origin must be in Supabase's Redirect URLs allowlist.
export const oauthLoginRedirectTo = `${window.location.origin}/login`;
export const oauthSignupRedirectTo = `${window.location.origin}/onboarding/step4`;

export const OAUTH_PROVIDERS = [
  { id: 'google', label: 'Google' },
  { id: 'apple', label: 'Apple' },
];

// Which of the providers above are switched on in Supabase. Showing a button for
// one that isn't ends in a raw "provider is not enabled" error page, so buttons
// only appear for providers the project reports as enabled. Resolves to [] when
// that can't be found out.
let enabledPromise = null;
export function enabledOAuthProviders() {
  enabledPromise ??= (async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY } });
      if (!res.ok) return [];
      const { external } = await res.json();
      return OAUTH_PROVIDERS.filter((p) => external?.[p.id] === true);
    } catch {
      return [];
    }
  })();
  return enabledPromise;
}

// Log in (or, for a provider identity we haven't seen, create the account —
// Login sends those into onboarding afterwards).
export function signInWithProvider(provider) {
  if (isNativeApp()) return nativeSignIn(provider);
  return supabase.auth.signInWithOAuth({ provider, options: { redirectTo: oauthLoginRedirectTo } });
}

// Onboarding signup: attaches the provider to the *current* guest session so
// the profile seeded from Steps 1-3 stays on the same user id (same reason
// Step4 upgrades via updateUser rather than a fresh signUp). Needs "Manual
// linking" enabled in Supabase (Authentication → Sign In / Providers).
export function linkProvider(provider) {
  // Natively there is no link-to-guest call for ID tokens, so this signs in (or
  // creates) the real account instead; Step4 then reloads itself and seeds that
  // account's profile from the saved onboarding answers.
  if (isNativeApp()) return nativeSignIn(provider);
  return supabase.auth.linkIdentity({ provider, options: { redirectTo: oauthSignupRedirectTo } });
}

// Providers report failures (denied consent, email already used by another
// account…) by redirecting back with error params in the query or hash.
export function readOAuthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('error_description') || hash.get('error_description') || null;
}
