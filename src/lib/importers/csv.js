// A small, forgiving CSV reader for diary exports from other apps. Handles a
// leading byte-order mark, quoted fields (with "" escapes, commas and newlines
// inside), CRLF/LF/CR line ends, and comma / semicolon / tab delimiters
// (spreadsheet apps in some locales save semicolon-separated "CSV").

const CANDIDATE_DELIMITERS = [',', ';', '\t'];

// Counts delimiters outside quotes on the first non-empty line.
function pickDelimiter(text) {
  let best = ',';
  let bestCount = 0;
  const line = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== '') ?? '';
  for (const d of CANDIDATE_DELIMITERS) {
    let count = 0;
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
}

// → array of rows, each an array of strings. Blank lines are dropped.
export function parseCsv(input) {
  let text = String(input ?? '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = pickDelimiter(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let fieldStarted = false;

  const endField = () => { row.push(field); field = ''; fieldStarted = false; };
  const endRow = () => {
    endField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && !fieldStarted) { inQuotes = true; fieldStarted = true; }
    else if (ch === delimiter) endField();
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; endRow(); }
    else if (ch === '\n') endRow();
    else { field += ch; fieldStarted = true; }
  }
  if (fieldStarted || field !== '' || row.length > 0) endRow();
  return rows;
}

// Rows as objects keyed by the header row (trimmed). Short rows are padded with
// empty strings; a repeated header keeps its first column.
export function parseCsvObjects(input) {
  const rows = parseCsv(input);
  if (rows.length === 0) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((cells) => {
    const rec = {};
    headers.forEach((h, i) => { if (h !== '' && !(h in rec)) rec[h] = (cells[i] ?? '').trim(); });
    return rec;
  });
  return { headers, records };
}
