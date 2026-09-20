// Pure helpers for body measurements and progress photos: which kinds exist,
// units, and "latest value and change" per kind. No I/O, unit-tested.

export const KINDS = [
  { id: 'waist', label: 'Waist' },
  { id: 'hips', label: 'Hips' },
  { id: 'chest', label: 'Chest' },
  { id: 'arm', label: 'Arm' },
  { id: 'thigh', label: 'Thigh' },
  { id: 'body_fat', label: 'Body fat' },
];

export const kindLabel = (id) => KINDS.find((k) => k.id === id)?.label ?? id;

// Lengths follow the profile's unit system; body fat is always a percentage.
export function unitFor(kind, profileUnit) {
  if (kind === 'body_fat') return 'pct';
  return profileUnit === 'imperial' ? 'in' : 'cm';
}

export const unitSuffix = (unit) => (unit === 'pct' ? '%' : unit);

// Compare across units (a client who switched from cm to inches mid-way) by
// normalising lengths to cm.
export const toBase = (value, unit) => (unit === 'in' ? Number(value) * 2.54 : Number(value));

const round1 = (n) => Math.round(n * 10) / 10;

export function formatMeasurement(value, unit) {
  return `${round1(Number(value))}${unit === 'pct' ? '%' : ` ${unit}`}`;
}

// The newest entry per kind plus how it changed from the one before it, in the
// newest entry's own unit. `delta` is null with only one entry. Rows may arrive
// in any order; kinds come back in KINDS order (unknown kinds last).
export function latestByKind(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    if (!groups.has(row.kind)) groups.set(row.kind, []);
    groups.get(row.kind).push(row);
  }
  const order = (kind) => { const i = KINDS.findIndex((k) => k.id === kind); return i === -1 ? KINDS.length : i; };
  return [...groups.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([kind, list]) => {
      const sorted = [...list].sort((a, b) => b.logged_date.localeCompare(a.logged_date));
      const [latest, previous] = sorted;
      let delta = null;
      if (previous) {
        const diffBase = toBase(latest.value, latest.unit) - toBase(previous.value, previous.unit);
        delta = round1(latest.unit === 'in' ? diffBase / 2.54 : diffBase);
      }
      return { kind, latest, previous: previous || null, delta, entries: sorted.length };
    });
}

// ── images ──────────────────────────────────────────────────────────────────

export const MAX_INPUT_BYTES = 25 * 1024 * 1024; // refuse before decoding anything absurd
export const MAX_EDGE = 1600;

// Scale (w, h) down so the longer side is at most maxEdge; never scales up.
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// null if the file is acceptable, otherwise a sentence for the UI.
export function validateImageFile(file) {
  if (!file) return 'Choose a photo.';
  if (!/^image\//i.test(file.type || '')) return 'That file isn’t an image.';
  if (file.size > MAX_INPUT_BYTES) return 'That photo is too large (25 MB max).';
  return null;
}
