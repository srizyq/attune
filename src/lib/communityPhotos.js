// Photos in Community: shrunk on the phone, kept in a private bucket, checked
// by the screen-photo function, then shown through short-lived signed links.
import { supabase } from './supabase';
import { fitWithin, MAX_EDGE, QUALITY } from './photoMath';

export const BUCKET = 'community-photos';

/** A File from the camera or library → a JPEG no wider than MAX_EDGE (well under the 2 MB limit). */
export function resizeToJpeg(file, { maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, maxEdge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not prepare that photo.'))), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that photo.')); };
    img.src = url;
  });
}

export const newPhotoId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export async function uploadPhoto(path, blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

export async function removePhoto(path) {
  if (!path) return;
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {}); // an orphaned file is harmless; a failed delete must not block the action
}

/**
 * Runs the automatic check on a just-uploaded photo. Resolves to
 * 'approved' | 'rejected' | 'pending' (pending = the check couldn't run yet).
 */
export async function screenPhoto({ kind, postId }) {
  try {
    const { data, error } = await supabase.functions.invoke('screen-photo', { body: { kind, post_id: postId } });
    if (error) return 'pending';
    return ['approved', 'rejected', 'pending', 'none'].includes(data?.status) ? data.status : 'pending';
  } catch {
    return 'pending';
  }
}

// A photo whose check failed (a network blip, the checker being down) stays
// "pending". Each time the app next sees one of your own, it asks again — once
// per photo per visit, so a check that keeps failing can't loop.
const retried = new Set();
export function forgetRetries() { retried.clear(); }

/** Re-runs the check for a still-pending photo of yours. Resolves to the new status, or null if there was nothing to do. */
export async function recheckPending({ kind, postId = null, path }) {
  const key = `${kind}:${postId || ''}:${path || ''}`;
  if (!path || retried.has(key)) return null;
  retried.add(key);
  const status = await screenPhoto({ kind, postId });
  return status === 'pending' ? null : status;
}

const URL_TTL = 3600; // seconds a link lives
const cache = new Map(); // path -> { url, expires }
const inflight = new Map(); // path -> Promise<string|null>

/** A temporary link to a photo you're allowed to see; remembered for most of its life. */
export function getPhotoUrl(path) {
  if (!path) return Promise.resolve(null);
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.url);
  if (!inflight.has(path)) {
    inflight.set(path, supabase.storage.from(BUCKET).createSignedUrl(path, URL_TTL)
      .then(({ data, error }) => {
        const url = error ? null : data?.signedUrl || null;
        if (url) cache.set(path, { url, expires: Date.now() + (URL_TTL - 300) * 1000 });
        return url;
      })
      .catch(() => null)
      .finally(() => inflight.delete(path)));
  }
  return inflight.get(path);
}

export function forgetPhotoUrl(path) { cache.delete(path); }
