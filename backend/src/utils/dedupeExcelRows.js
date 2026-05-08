const { normalizeName } = require('./normalizeName');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function dateScore(value) {
  if (!value) return -Infinity;
  const s = String(value).trim();
  if (!s || !ISO_DATE.test(s)) return -Infinity;
  const t = Date.parse(s);
  return Number.isNaN(t) ? -Infinity : t;
}

function dedupeExcelRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const groups = new Map();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = normalizeName(row && row.name);
    if (!key) continue;

    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { row, index: i, score: dateScore(row.enrollmentDate) });
      continue;
    }

    const score = dateScore(row.enrollmentDate);
    if (score > existing.score) {
      groups.set(key, { row, index: existing.index, score });
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.index - b.index)
    .map(g => g.row);
}

module.exports = { dedupeExcelRows };
