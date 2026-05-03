const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');
const { normalizeName } = require('../utils/normalizeName');
const { dedupeExcelRows } = require('../utils/dedupeExcelRows');

async function categorizeUpload(excelRows, branch) {
  const { students: studentsTbl, archived: archivedTbl } = getTableNames();

  const deduped = dedupeExcelRows(Array.isArray(excelRows) ? excelRows : []);

  const studentRes = await pool.query(
    `SELECT id, name, status, gender, branch, enrollment_date, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm
       FROM ${studentsTbl}
      WHERE LOWER(TRIM(branch)) = LOWER(TRIM($1))`,
    [branch]
  );

  const archivedRes = await pool.query(
    `SELECT no, student_id, name, gender, branch, enrollment_date, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm,
            status, date_of_birth, guardian_name, guardian_mobile, guardian_email
       FROM ${archivedTbl}
      WHERE LOWER(TRIM(branch)) = LOWER(TRIM($1))`,
    [branch]
  );

  const studentMap = new Map();
  for (const row of studentRes.rows) {
    const key = normalizeName(row.name);
    if (key && !studentMap.has(key)) studentMap.set(key, row);
  }

  const archivedMap = new Map();
  for (const row of archivedRes.rows) {
    const key = normalizeName(row.name);
    if (key && !archivedMap.has(key)) archivedMap.set(key, row);
  }

  const result = { new: [], restore: [], matched: [], archive: [] };
  const excelKeys = new Set();

  for (const excel of deduped) {
    const key = normalizeName(excel.name);
    if (!key) continue;
    excelKeys.add(key);

    if (studentMap.has(key)) {
      result.matched.push({ excel, db: studentMap.get(key) });
    } else if (archivedMap.has(key)) {
      result.restore.push({ excel, archived: archivedMap.get(key) });
    } else {
      result.new.push(excel);
    }
  }

  for (const row of studentRes.rows) {
    const key = normalizeName(row.name);
    if (!key) continue;
    if (!excelKeys.has(key)) result.archive.push(row);
  }

  return result;
}

module.exports = { categorizeUpload };
