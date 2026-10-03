// Per-user / per-IP request limits for the serverless functions, backed by the
// rate_limit_hit() database function (see schema.sql) because serverless
// instances share no memory. Underscore-prefixed so Vercel doesn't deploy it
// as its own endpoint (the project is at the 12-function Hobby cap).
//
// Fails OPEN: if the database function isn't there yet (migration not applied)
// or the call errors, the request is allowed — a limiter that can take the
// app down is worse than no limiter.
import { createClient } from '@supabase/supabase-js';

export const AI_REQUESTS_PER_MINUTE = 20;

export async function rateLimit(supabase, key, max, windowSeconds = 60) {
  try {
    const { data, error } = await supabase.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}

export function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded || '').split(',')[0].trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

let ipClient;
// For endpoints with no signed-in user (the food-database proxies).
export async function rateLimitByIp(req, name, max, windowSeconds = 60) {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return true;
  ipClient ??= createClient(url, key);
  return rateLimit(ipClient, `${name}:ip:${clientIp(req)}`, max, windowSeconds);
}

export function tooManyRequests(res) {
  res.setHeader?.('Retry-After', '60');
  res.status(429).json({ error: 'Too many requests — slow down and try again in a minute.' });
}
