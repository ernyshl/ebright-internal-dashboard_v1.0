function normalizeName(name) {
  if (name === null || name === undefined) return '';
  const s = String(name);
  if (!s) return '';
  return s
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

module.exports = { normalizeName };
