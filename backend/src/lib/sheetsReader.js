// Pluggable reader for the NL to CT spreadsheet.
//
// Two implementations are supported, selected via env var
// NL_TO_CT_SHEET_READER:
//
//   'csv' (default) - public CSV export. Requires the sheet to be
//                     "Anyone with the link can view".
//   'serviceAccount' - googleapis with a service-account JSON key.
//                      Stubbed out for now; throws on use until wired up.
//
// Both expose:
//   async readTab({ spreadsheetId, gid }) → { tabTitle, rows }
//     rows: string[][]  — outer index = sheet row (0-based, so row 3 is rows[2])
//                         inner index = column (0-based)

const READER_KIND = process.env.NL_TO_CT_SHEET_READER || 'csv';

// ── 30-second in-memory cache ──────────────────────────────────────────
const CACHE_TTL_MS = 30_000;
const cache = new Map(); // key → { value, expiresAt }

function cacheKey(spreadsheetId, gid) {
  return `${spreadsheetId}::${gid}`;
}
function cacheGet(spreadsheetId, gid) {
  const hit = cache.get(cacheKey(spreadsheetId, gid));
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(cacheKey(spreadsheetId, gid));
    return null;
  }
  return hit.value;
}
function cacheSet(spreadsheetId, gid, value) {
  cache.set(cacheKey(spreadsheetId, gid), { value, expiresAt: Date.now() + CACHE_TTL_MS });
}
function cacheInvalidate(spreadsheetId, gid) {
  cache.delete(cacheKey(spreadsheetId, gid));
}

// ── Minimal CSV parser ─────────────────────────────────────────────────
// Handles quoted fields, embedded commas, embedded newlines, escaped
// quotes. Good enough for the Google CSV export shape — no need to pull
// in a dependency.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (ch === '\r') { /* skip; \n will close the row */ }
      else field += ch;
    }
  }
  // Trailing field / row
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ── CSV reader ─────────────────────────────────────────────────────────
async function csvReadTab({ spreadsheetId, gid }) {
  const cached = cacheGet(spreadsheetId, gid);
  if (cached) return cached;

  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
  const res = await fetch(exportUrl, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw Object.assign(new Error('Tab not found'), { code: 'TAB_NOT_FOUND' });
  if (!res.ok) throw new Error(`CSV export failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const rows = parseCsv(text);

  // Note: Google's CSV export doesn't include the tab title, and the
  // htmlview <title> tag returns the *spreadsheet* name (not the tab
  // name) regardless of gid. So we don't try to discover the tab title
  // here — callers that need it ask the user directly.
  const value = { tabTitle: null, rows };
  cacheSet(spreadsheetId, gid, value);
  return value;
}

// ── Service-account reader stub ────────────────────────────────────────
async function serviceAccountReadTab(_args) {
  throw new Error(
    "Service-account reader not implemented yet. " +
    "Either install 'googleapis', wire up credentials, and add the implementation, " +
    "or set NL_TO_CT_SHEET_READER=csv (the default)."
  );
}

// ── Dispatcher ─────────────────────────────────────────────────────────
async function readTab(args) {
  if (READER_KIND === 'csv') return csvReadTab(args);
  if (READER_KIND === 'serviceAccount') return serviceAccountReadTab(args);
  throw new Error(`Unknown NL_TO_CT_SHEET_READER value: ${READER_KIND}`);
}

module.exports = { readTab, cacheInvalidate, _parseCsv: parseCsv };
