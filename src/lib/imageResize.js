import { fitWithin, MAX_EDGE, validateImageFile } from './bodyProgress';

// Re-encodes any browser-readable image as a JPEG with its longest side at
// most MAX_EDGE. A phone photo is 3–12 MB; this makes it a few hundred KB,
// which is what makes uploading progress photos on mobile data reasonable —
// and re-encoding through a canvas also drops the EXIF block (including GPS
// location) that the original file carries. Browser-only (canvas), so it's
// kept tiny; the sizing maths it depends on is tested in bodyProgress.test.js.
export async function resizeToJpeg(file, { maxEdge = MAX_EDGE, quality = 0.82 } = {}) {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  let bitmap;
  try {
    // 'from-image' applies the camera's rotation flag so a portrait shot
    // isn't stored sideways.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Couldn’t read that image — try a JPEG or PNG.');
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Couldn’t process that image.');
    return blob;
  } finally {
    bitmap.close?.();
  }
}
