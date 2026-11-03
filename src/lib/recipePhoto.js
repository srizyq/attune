import { supabase } from './supabase';
import { resizeToJpeg } from './imageResize';

const BUCKET = 'recipe-photos';

// Shrinks the photo (and drops its location data), then stores it in the
// person's own folder of the private bucket. Returns the path to keep on the recipe.
export async function uploadRecipePhoto(userId, file) {
  const blob = await resizeToJpeg(file, { maxEdge: 1200 });
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

// Best effort: a photo left behind in storage is harmless, so a failed delete never blocks a save.
export async function removeRecipePhoto(path) {
  if (!path) return;
  try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* ignore */ }
}

// Short-lived links for a private bucket. Supabase only signs a path the caller
// may read: their own photos, or a friend's photo on a recipe shared with them.
export async function getRecipePhotoUrls(paths, expiresInSeconds = 3600) {
  const wanted = [...new Set((paths || []).filter(Boolean))];
  if (!wanted.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(wanted, expiresInSeconds);
  if (error) throw error;
  return Object.fromEntries((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
}
