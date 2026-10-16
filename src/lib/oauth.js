import { supabase } from './supabase';

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

// Log in (or, for a provider identity we haven't seen, create the account —
// Login sends those into onboarding afterwards).
export function signInWithProvider(provider) {
  return supabase.auth.signInWithOAuth({ provider, options: { redirectTo: oauthLoginRedirectTo } });
}

// Onboarding signup: attaches the provider to the *current* guest session so
// the profile seeded from Steps 1-3 stays on the same user id (same reason
// Step4 upgrades via updateUser rather than a fresh signUp). Needs "Manual
// linking" enabled in Supabase (Authentication → Sign In / Providers).
export function linkProvider(provider) {
  return supabase.auth.linkIdentity({ provider, options: { redirectTo: oauthSignupRedirectTo } });
}

// Providers report failures (denied consent, email already used by another
// account…) by redirecting back with error params in the query or hash.
export function readOAuthError() {
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('error_description') || hash.get('error_description') || null;
}
