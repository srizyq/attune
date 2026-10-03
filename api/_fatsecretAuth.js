// Shared OAuth2 token helper for the FatSecret serverless proxies.
// Vercel excludes files/folders starting with "_" under /api from routing,
// so this is importable by sibling functions without becoming its own
// endpoint. Tokens are cached per scope string across warm invocations.

const cache = new Map(); // scope -> { token, expiresAt }

export async function getFatSecretToken(scope, forceRefresh = false) {
  const cached = cache.get(scope);
  if (!forceRefresh && cached && Date.now() < cached.expiresAt) return cached.token;

  const clientId = process.env.FATSECRET_CLIENT_ID;
  const clientSecret = process.env.FATSECRET_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("FatSecret credentials are not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://oauth.fatsecret.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`FatSecret token request failed: ${res.status}`);
  const data = await res.json();

  // Refresh a minute early so a request never runs on an about-to-expire token.
  cache.set(scope, { token: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 });
  return data.access_token;
}
