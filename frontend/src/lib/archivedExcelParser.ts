import * as XLSX from 'xlsx';

function formatDate(val: any): string {
  if (!val) return '';
  const s = String(val).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

// Map "Ebright Sri Petaling" → "SP", "Ebright Ampang" → "AMP", etc.
function parseBranch(val: any): string {
  const s = String(val || '').toLowerCase().trim();
  if (s.includes('petaling') || s.includes('sri')) return 'SP';
  if (s.includes('ampang') || s.includes('amp')) return 'AMP';
  if (s.includes('online') || s.includes('onl')) return 'ONL';
  if (s.includes('setapak')) return 'SET';
  if (s.includes('puchong')) return 'PCH';
  if (s.includes('klcc') || s.includes('kl')) return 'KL';
  return 'ONL'; // default
}

export async function parseArchivedExcelFile(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames.find(n =>
    n.trim().toLowerCase() === 'students'
  ) ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd',
  });

  // Detect format from header row
  const header = rows[0]?.map((h: any) => String(h).toLowerCase().trim()) ?? [];
  const isInvoiceFormat =
    header.some(h => h.includes('invoice')) ||
    header.some(h => h.includes('invoice number'));

  const results: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    let studentId: string, name: string, gender: string,
        enrollmentDate: string, dateOfBirth: string,
        createdOn: string, archivedOn: string,
        guardianName: string, guardianMobile: string,
        guardianEmail: string, branch: string;

    if (isInvoiceFormat) {
      // Invoice Excel format:
      // A(0)=No | B(1)=Invoice Number | C(2)=Student Name | D(3)=Invoice Status
      // E(4)=Invoice Generation Date | F(5)=Invoice Issue Date | G(6)=Invoice Due Date
      // H(7)=Invoice Created By (branch) | I(8)=Paid Amount | ...
      studentId     = String(row[1] ?? '').trim();
      name          = String(row[2] ?? '').trim().toUpperCase();
      gender        = 'Male'; // not in invoice data, default
      branch        = parseBranch(row[7]);
      enrollmentDate = formatDate(row[5]); // Invoice Issue Date
      dateOfBirth   = '';
      createdOn     = formatDate(row[4]); // Invoice Generation Date
      archivedOn    = '';
      guardianName  = '';
      guardianMobile = '';
      guardianEmail = '';
    } else {
      // Original student export format:
      // A(0)=Student ID | B(1)=Student Name | C(2)=Gender | D(3)=Enrollment Date
      // E(4)=Date of Birth | N(13)=Created On | P(15)=Archived On
      // Q(16)=Guardian Name | S(18)=Guardian Mobile | T(19)=Guardian Email
      studentId     = String(row[0] ?? '').trim();
      name          = String(row[1] ?? '').trim().toUpperCase();
      const genderRaw = String(row[2] ?? '').trim().toLowerCase();
      gender        = genderRaw === 'female' || genderRaw === 'f' ? 'Female' : 'Male';
      branch        = 'ONL';
      enrollmentDate = formatDate(row[3]);
      dateOfBirth   = formatDate(row[4]);
      createdOn     = formatDate(row[13]);
      archivedOn    = formatDate(row[15]);
      guardianName  = String(row[16] ?? '').trim();
      guardianMobile = String(row[18] ?? '').trim();
      guardianEmail = String(row[19] ?? '').trim();
    }

    if (!name) continue;

    results.push({
      studentId, name, gender, branch,
      enrollmentDate, dateOfBirth, createdOn, archivedOn,
      guardianName, guardianMobile, guardianEmail,
    });
  }

  return results;
}

export function generateArchivedId() {
  return `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
