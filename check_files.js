const XLSX = require('./frontend/node_modules/xlsx');
const files = [
  'C:/Users/HP/Downloads/SP ARCHIVE STUDENT.xlsx',
  'C:/Users/HP/Downloads/ST ARCHIVE STUDENT.xlsx',
  'C:/Users/HP/OneDrive/Desktop/MASTERCOPY AONE ATTENDANCE.xlsx',
];

for (const f of files) {
  try {
    const wb = XLSX.readFile(f, { cellDates: true });
    console.log('\n=== ' + f.split('/').pop() + ' ===');
    console.log('Sheets:', wb.SheetNames);
    for (const name of wb.SheetNames.slice(0,3)) {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
      console.log(`  Sheet "${name}": ${rows.length} rows`);
      if (rows[0]) console.log('  Header:', JSON.stringify(rows[0]).slice(0, 200));
      if (rows[1]) console.log('  Row1:', JSON.stringify(rows[1]).slice(0, 200));
    }
  } catch(e) { console.log('ERROR:', f, e.message); }
}
