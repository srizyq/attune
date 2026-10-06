// Photo sizing, kept apart from the Supabase client so it can be tested on its own.
export const MAX_EDGE = 1080;
export const QUALITY = 0.82;

/** Dimensions that fit inside max×max without ever scaling up. */
export function fitWithin(width, height, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
