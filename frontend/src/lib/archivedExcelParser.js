import * as XLSX from 'xlsx';

function formatDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

export async function parseArchivedExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'students') ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const studentId = String(row[0] ?? '').trim();
    const name = String(row[1] ?? '').trim().toUpperCase();
    if (!name) continue;
    const genderRaw = String(row[2] ?? '').trim().toLowerCase();
    const gender = genderRaw === 'female' || genderRaw === 'f' ? 'Female' : 'Male';
    results.push({
      studentId,
      name,
      gender,
      enrollmentDate: formatDate(row[3]),
      dateOfBirth: formatDate(row[4]),
      createdOn: formatDate(row[13]),
      archivedOn: formatDate(row[15]),
      guardianName: String(row[16] ?? '').trim(),
      guardianMobile: String(row[18] ?? '').trim(),
      guardianEmail: String(row[19] ?? '').trim(),
    });
  }
  return results;
}

export function generateArchivedId() {
  return `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
