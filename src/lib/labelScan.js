import { supabase } from './supabase';
import { fetchWithTimeout } from './http';

// Shrinks a photo of a nutrition label to something the reader can take quickly.
function shrink(file, maxEdge = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

// Reads the numbers off a photo of a nutrition label (the same reader the
// barcode "add product" form uses). Resolves to the reader's reply; throws an
// Error whose message is fit to show.
export async function readNutritionLabel(file) {
  let image;
  try {
    image = await shrink(file);
  } catch {
    throw new Error("Couldn't read that image — try again, or pick a JPEG/PNG.");
  }
  let res;
  let data;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    res = await fetchWithTimeout('/api/recognize-label', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
    });
    data = await res.json();
  } catch {
    throw new Error("Couldn't read this label. Check your connection and try again.");
  }
  if (!res.ok || data.error) throw new Error(data.error || "Couldn't read this label. Try again or enter the numbers yourself.");
  return data;
}
