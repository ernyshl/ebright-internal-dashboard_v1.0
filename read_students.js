const XLSX = require('./frontend/node_modules/xlsx');
const https = require('https');
const http = require('http');

// Branch files in Downloads
const BRANCH_FILES = [
  ['AMP', 'C:\\Users\\HP\\Downloads\\AMP.xlsx'],
  ['BBB', 'C:\\Users\\HP\\Downloads\\BBB.xlsx'],
  ['BSP', 'C:\\Users\\HP\\Downloads\\BSP.xlsx'],
  ['BTHO', 'C:\\Users\\HP\\Downloads\\BTHO.xlsx'],
  ['CJY', 'C:\\Users\\HP\\Downloads\\CJY.xlsx'],
  ['DA', 'C:\\Users\\HP\\Downloads\\DA.xlsx'],
  ['DK', 'C:\\Users\\HP\\Downloads\\DK.xlsx'],
  ['EGR', 'C:\\Users\\HP\\Downloads\\EGR.xlsx'],
  ['KD', 'C:\\Users\\HP\\Downloads\\KD.xlsx'],
  ['KLG', 'C:\\Users\\HP\\Downloads\\KLG.xlsx'],
  ['KTG', 'C:\\Users\\HP\\Downloads\\KTG.xlsx'],
  ['KW', 'C:\\Users\\HP\\Downloads\\KW.xlsx'],
  ['ONL', 'C:\\Users\\HP\\Downloads\\ONL.xlsx'],
  ['PJY', 'C:\\Users\\HP\\Downloads\\PJY.xlsx'],
  ['RBY', 'C:\\Users\\HP\\Downloads\\RBY.xlsx'],
  ['SA', 'C:\\Users\\HP\\Downloads\\SA.xlsx'],
  ['SHA', 'C:\\Users\\HP\\Downloads\\SHA.xlsx'],
  ['SP', 'C:\\Users\\HP\\Downloads\\SP.xlsx'],
  ['ST', 'C:\\Users\\HP\\Downloads\\ST.xlsx'],
  ['TSG', 'C:\\Users\\HP\\Downloads\\TSG.xlsx'],
];

function parseBranchFile(branch, filePath) {
  try {
    const wb = XLSX.readFile(filePath, { cellDates: true });
    const sheetName = wb.SheetNames.find(n => n.trim().toLowerCase() === 'students') ?? wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });

    const results = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row[1] ?? '').trim().toUpperCase();
      if (!name) continue;
      const genderRaw = String(row[2] ?? '').trim().toLowerCase();
      const gender = genderRaw === 'female' || genderRaw === 'f' ? 'Female' : 'Male';
      const enrollmentDate = String(row[12] ?? '').trim() || null;
      const statusRaw = String(row[13] ?? '').trim().toLowerCase();
      const status = statusRaw === 'inactive' ? 'Inactive' : 'Active';
      results.push({ name, gender, enrollmentDate, status, grade: 'G1', chapter: 'C1', branch });
    }
    console.log(`${branch}: ${results.length} students`);
    return results;
  } catch (e) {
    console.log(`${branch}: SKIP (${e.message})`);
    return [];
  }
}

// Also try reading the student-progresses export which has grade/chapter
function readProgressExport(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    console.log(`Progress export: ${rows.length} rows, cols: ${Object.keys(rows[0]||{}).join(', ')}`);
    return rows;
  } catch(e) {
    console.log(`Progress export error: ${e.message}`);
    return [];
  }
}

const progressRows = readProgressExport('C:\\Users\\HP\\Downloads\\student-progresses-20260402180635.xlsx');

let allStudents = [];
for (const [branch, path] of BRANCH_FILES) {
  allStudents = allStudents.concat(parseBranchFile(branch, path));
}
console.log('\nTotal students from branch files:', allStudents.length);
