// Serverless proxy for FatSecret Platform API barcode lookup. Returns full
// nutrition data directly (no follow-up food.get call needed) — confirmed
// by direct API testing, and much more complete/reliable than Open Food
// Facts' crowdsourced entries, many of which have missing nutriment data.

import { getFatSecretToken } from "./_fatsecretAuth.js";
import { rateLimitByIp, tooManyRequests } from "./_rateLimit.js";

const SCOPE = "basic premier barcode";

async function lookupBarcode(barcode, token) {
  const url = `https://platform.fatsecret.com/rest/food/barcode/find-by-id/v2?barcode=${encodeURIComponent(barcode)}&format=json`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
}

export default async function handler(req, res) {
  const barcode = req.query?.barcode;
  if (!barcode || !barcode.trim()) {
    res.status(400).json({ error: "Missing query parameter 'barcode'" });
    return;
  }

  if (!(await rateLimitByIp(req, "fatsecret-barcode", 60))) {
    tooManyRequests(res);
    return;
  }

  try {
    let token = await getFatSecretToken(SCOPE);
    let res2 = await lookupBarcode(barcode, token);
    if (res2.status === 401) {
      token = await getFatSecretToken(SCOPE, true);
      res2 = await lookupBarcode(barcode, token);
    }
    if (!res2.ok) {
      res.status(502).json({ error: `FatSecret barcode lookup failed: ${res2.status}` });
      return;
    }
    const data = await res2.json();
    res.status(200).json(data);
  } catch (err) {
    console.error("FatSecret barcode proxy error:", err);
    res.status(502).json({ error: "Barcode lookup is temporarily unavailable" });
  }
}
