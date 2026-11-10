// Input hygiene shared by every place a user types a name or picks a file.
// React already escapes text on render (the app uses no innerHTML), so this is
// defence in depth: nothing script-like or invisible gets stored in the first place.

// Usernames: lowercase letters, digits, "_" and "." only; 3-20 chars; no edge/double punctuation.
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9_.]{1,18})[a-z0-9]$/;

export function sanitizeUsername(input) {
  return String(input ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '')
    .replace(/([_.]){2,}/g, '$1')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 20);
}

export function isValidUsername(input) {
  return typeof input === 'string' && USERNAME_RE.test(input) && !/[_.]{2}/.test(input);
}

// Display names: letters (any language), digits, spaces and . ' - _ only.
export function sanitizeDisplayName(input, max = 40) {
  return String(input ?? '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} .'_-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// Free text (notes, bios): strip control/invisible/bidi chars and angle brackets.
export function sanitizeText(input, max = 500) {
  return String(input ?? '')
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex, no-irregular-whitespace
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿<>]/g, '')
    .trim()
    .slice(0, max);
}

// Uploads: allow-list by real MIME type AND extension; the stored extension is
// derived from the type, never from the user's filename (blocks .php, .jsp, double extensions).
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const BLOCKED_EXT = /\.(php\d?|phtml|jsp|jspx|asp|aspx|cgi|pl|py|rb|sh|bash|exe|bat|cmd|com|dll|jar|war|js|mjs|html?|svg|xml|swf)(\.|$)/i;

export function validateImageUpload(file) {
  if (!file) return { ok: false, error: 'No file selected.' };
  if (BLOCKED_EXT.test(file.name || '')) return { ok: false, error: 'That file type is not allowed.' };
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return { ok: false, error: 'Please choose a JPG, PNG, WebP or GIF image.' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, error: 'Image must be under 5 MB.' };
  return { ok: true, ext, contentType: file.type };
}
