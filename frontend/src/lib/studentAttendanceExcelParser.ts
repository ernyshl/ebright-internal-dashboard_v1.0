import * as XLSX from 'xlsx';

export type AttendanceRow = {
  studentName: string;
  attendanceStatus: string;
  lessonName: string;
  lessonTeachers: string;
  lessonDate: string;
  day: string;
  attendanceBy: string;
};

function fmtCell(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

export async function parseAttendanceExcelFile(file: File): Promise<AttendanceRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd',
  });

  const out: AttendanceRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const studentName = fmtCell(r[1]);   // Column B
    if (!studentName) continue;
    out.push({
      studentName,
      attendanceStatus: fmtCell(r[2]),   // Column C
      lessonName:       fmtCell(r[4]),   // Column E
      lessonTeachers:   fmtCell(r[5]),   // Column F
      lessonDate:       fmtCell(r[6]),   // Column G
      day:              fmtCell(r[7]),   // Column H
      attendanceBy:     fmtCell(r[10]),  // Column K
    });
  }
  return out;
}
