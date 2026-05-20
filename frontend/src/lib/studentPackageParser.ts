import * as XLSX from 'xlsx';

export type PackageRow = {
  name: string;
  packageStatus: string;
  creditExpiryDate: string; // YYYY-MM-DD or '' if unparseable
};

function toIsoDate(val: any): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Common Excel display formats: "15-Nov-2026", "15 Nov 2026", "15/11/2026", "11/15/2026"
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m1 = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{4})$/);
  if (m1) {
    const mon = months[m1[2].slice(0, 3).toLowerCase()];
    if (mon) return `${m1[3]}-${mon}-${m1[1].padStart(2, '0')}`;
  }
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) {
    return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return '';
}

export async function parsePackageExcelFile(file: File): Promise<PackageRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName =
    workbook.SheetNames.find(n => n.trim().toLowerCase() === 'package credits') ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

  // Dedupe by name — keep first occurrence (sheet is sorted by latest PID at top,
  // so the first row for a name is the most recent package).
  const seen = new Set<string>();
  const results: PackageRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = String(row[1] ?? '').trim().toUpperCase();  // col B
    if (!name) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    const packageStatus = String(row[6] ?? '').trim();           // col G
    const creditExpiryDate = toIsoDate(row[12]);                  // col M
    results.push({ name, packageStatus, creditExpiryDate });
  }
  return results;
}
