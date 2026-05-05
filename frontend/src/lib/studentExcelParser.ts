import * as XLSX from 'xlsx';

export async function parseExcelFile(file, defaultBranch = 'ONL') {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.find(n => n.trim().toLowerCase() === 'students') ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

  const results = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[1] ?? '').trim().toUpperCase();
    if (!name) continue;
    const genderRaw = String(row[2] ?? '').trim().toLowerCase();
    const gender = genderRaw === 'female' || genderRaw === 'f' ? 'Female' : 'Male';
    const enrollmentDate = String(row[12] ?? '').trim();
    const statusRaw = String(row[13] ?? '').trim().toLowerCase();
    const status = statusRaw === 'inactive' ? 'Inactive' : 'Active';
    const guardianName = String(row[16] ?? '').trim();
    const guardianMobile = String(row[18] ?? '').trim();
    results.push({ name, gender, enrollmentDate, status, grade: 'G1', chapter: 'C1', branch: defaultBranch, guardianName, guardianMobile });
  }
  return results;
}

export function generateId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
