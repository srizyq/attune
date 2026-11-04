import { supabase } from './supabase';
import { fetchWithTimeout } from './http';

// Asks /api/estimate-food (mode "micros") for the vitamins, minerals and fats of
// foods no reference table matched — Pro only. Answers are remembered on this
// device so a food isn't paid for again each time its page opens; they are never
// written to the diary and always shown as an AI estimate.
const STORE = 'attune.aiMicros.v1';
const MAX_REMEMBERED = 300;

const keyOf = (p) => [p.name, p.brand || '', Math.round(Number(p.grams) || 0), Math.round(Number(p.cal) || 0)].join('|').toLowerCase();

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(map) {
  try {
    const keys = Object.keys(map);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED))) delete map[k];
    localStorage.setItem(STORE, JSON.stringify(map));
  } catch { /* storage unavailable — the answer just isn't remembered */ }
}

/** parts: [{ name, brand?, grams, cal }] -> one { key: value } (or null) per part, in order. */
export async function askAiMicros(parts) {
  const remembered = load();
  const answers = parts.map((p) => remembered[keyOf(p)] || null);
  const todo = parts.map((p, i) => i).filter((i) => !answers[i]);
  if (!todo.length) return answers;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return answers;
  const res = await fetchWithTimeout('/api/estimate-food', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ mode: 'micros', items: todo.map((i) => parts[i]) }),
  });
  if (!res.ok) return answers; // not Pro, rate limited, or unavailable: just no estimate
  const data = await res.json();
  todo.forEach((partIndex, n) => {
    const micros = data.items?.[n];
    if (micros && Object.keys(micros).length) { answers[partIndex] = micros; remembered[keyOf(parts[partIndex])] = micros; }
  });
  save(remembered);
  return answers;
}
