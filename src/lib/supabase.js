import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your Supabase project values.'
  );
}

export const supabase = createClient(url, anonKey);

// Every confirmation-email call (signup confirm, resend, email-change on
// upgrade) needs this — without an explicit emailRedirectTo, Supabase
// falls back to whatever "Site URL" is set in the dashboard, which is
// easy to leave stale (still localhost, or missing once a custom domain
// is added) and silently sends users to a broken link. Using the
// origin the app is actually running on means dev, preview, and
// production deployments each redirect correctly without needing this
// touched. Still requires that origin to be in Supabase's Redirect URLs
// allowlist (Authentication → URL Configuration) — Supabase rejects an
// emailRedirectTo that isn't allow-listed even when it's passed correctly.
export const emailRedirectTo = `${window.location.origin}/dashboard`;
