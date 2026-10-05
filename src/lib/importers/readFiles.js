// Turns the files someone picked into [{ name, text }] CSVs. An export from
// another app is usually a .zip of CSVs (MyFitnessPal) or a single .csv, so both
// are accepted; anything else is reported, not guessed at. Reading happens in
// the browser — nothing is uploaded.
import { unzipSync, strFromU8 } from 'fflate';

export const MAX_FILES = 40;
export const MAX_CSV_BYTES = 25 * 1024 * 1024; // per CSV, also the cap on a zip's unpacked size per entry
export const MAX_TOTAL_BYTES = 80 * 1024 * 1024;

const baseName = (path) => String(path).split(/[\\/]/).pop();
const isCsvName = (name) => /\.(csv|tsv|txt)$/i.test(name);
const isJunk = (path) => /(^|[\\/])(__MACOSX|\.DS_Store)([\\/]|$)/.test(path) || baseName(path).startsWith('._');

// → { files: [{ name, text }], problems: [string] }
export async function readImportFiles(fileList) {
  const picked = Array.from(fileList || []);
  const files = [];
  const problems = [];
  let total = 0;

  const addCsv = (name, text, bytes) => {
    if (files.length >= MAX_FILES) {
      const msg = `Only the first ${MAX_FILES} files were read.`;
      if (!problems.includes(msg)) problems.push(msg);
      return;
    }
    total += bytes;
    if (total > MAX_TOTAL_BYTES) { problems.push(`${name} wasn't read — the files are too large to import in one go.`); return; }
    files.push({ name, text });
  };

  for (const file of picked) {
    const name = file.name || 'file';
    if (/\.zip$/i.test(name)) {
      if (file.size > MAX_TOTAL_BYTES) { problems.push(`${name} is too large (over ${Math.round(MAX_TOTAL_BYTES / 1048576)} MB).`); continue; }
      let entries;
      const oversize = [];
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        // The filter runs before anything is inflated, so an oversize entry is never unpacked.
        entries = unzipSync(bytes, {
          filter: (f) => {
            if (isJunk(f.name) || !isCsvName(f.name)) return false;
            if (f.originalSize > MAX_CSV_BYTES) { oversize.push(baseName(f.name)); return false; }
            return true;
          },
        });
      } catch {
        problems.push(`${name} couldn't be opened as a zip file.`);
        continue;
      }
      for (const big of oversize) problems.push(`${big} (in ${name}) is too large (over ${Math.round(MAX_CSV_BYTES / 1048576)} MB) and was skipped.`);
      const names = Object.keys(entries);
      if (names.length === 0 && oversize.length === 0) problems.push(`${name} has no CSV files in it.`);
      for (const path of names) addCsv(baseName(path), strFromU8(entries[path]), entries[path].length);
    } else if (isCsvName(name)) {
      if (file.size > MAX_CSV_BYTES) { problems.push(`${name} is too large (over ${Math.round(MAX_CSV_BYTES / 1048576)} MB).`); continue; }
      addCsv(name, await file.text(), file.size);
    } else {
      problems.push(`${name} isn't a CSV or zip file, so it was skipped.`);
    }
  }
  return { files, problems };
}
