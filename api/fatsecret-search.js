// Serverless proxy for FatSecret Platform API food search.
//
// FatSecret uses OAuth 2.0 client-credentials with a Client Secret that
// signs/authenticates every request, so this secret must never reach the
// browser (anyone reading it out of the bundle could exhaust or abuse the
// account's quota). This function holds the secret via getFatSecretToken
// and proxies the actual search so the browser only ever talks to our own
// origin.

import { getFatSecretToken } from "./_fatsecretAuth.js";

const SCOPE = "basic premier";

async function searchFoods(query, token) {
  const url = `https://platform.fatsecret.com/rest/foods/search/v5?search_expression=${encodeURIComponent(query)}&format=json&region=AU&max_results=30`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

export default async function handler(req, res) {
  const query = req.query?.q;
  if (!query || !query.trim()) {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }

  try {
    let token = await getFatSecretToken(SCOPE);
    let res2 = await searchFoods(query, token);
    // A cached token that expired early (clock skew, revoked, etc.) fails
    // with 401 — force one fresh token + retry before giving up.
    if (res2.status === 401) {
      token = await getFatSecretToken(SCOPE, true);
      res2 = await searchFoods(query, token);
    }
    if (!res2.ok) {
      res.status(502).json({ error: `FatSecret search failed: ${res2.status}` });
      return;
    }
    const data = await res2.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("FatSecret proxy error:", err);
    res.status(502).json({ error: "FatSecret search is temporarily unavailable" });
  }
}
