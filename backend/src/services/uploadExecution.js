const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoOrNull(value) {
  if (!value) return null;
  const s = String(value).trim();
  return ISO_DATE.test(s) ? s : null;
}

function jsonbStringOf(value) {
  if (value === null || value === undefined) return '[]';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

async function executeUpload(categorized, branch) {
  const { students: studentsTbl, archived: archivedTbl } = getTableNames();

  const newRows     = Array.isArray(categorized?.new)     ? categorized.new     : [];
  const restoreRows = Array.isArray(categorized?.restore) ? categorized.restore : [];
  const archiveRows = Array.isArray(categorized?.archive) ? categorized.archive : [];
  const matchedRows = Array.isArray(categorized?.matched) ? categorized.matched : [];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const row of newRows) {
      await client.query(
        `INSERT INTO ${studentsTbl}
           (name, status, gender, branch, enrollment_date, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7::jsonb,$8,$9::jsonb,$10)`,
        [
          row.name,
          row.status || 'Active',
          row.gender || 'Male',
          branch,
          isoOrNull(row.enrollmentDate),
          'G1 — C1',
          '[]',
          '0/0',
          '[]',
          '0/0',
        ]
      );
    }

    for (const item of restoreRows) {
      const a = item.archived;
      await client.query(
        `INSERT INTO ${studentsTbl}
           (name, status, gender, branch, enrollment_date, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm)
         VALUES ($1,$2,$3,$4,$5::date,$6,$7::jsonb,$8,$9::jsonb,$10)`,
        [
          a.name,
          'Active',
          a.gender || 'Male',
          a.branch || branch,
          isoOrNull(a.enrollment_date),
          a.grade_chapter || 'G1 — C1',
          jsonbStringOf(a.fa_progress_json),
          a.total_fa || '0/0',
          jsonbStringOf(a.pcm_progress_json),
          a.total_pcm || '0/0',
        ]
      );
      await client.query(
        `DELETE FROM ${archivedTbl} WHERE no = $1`,
        [a.no]
      );
    }

    for (const s of archiveRows) {
      const newStatus = s.status === 'Active' ? 'Inactive' : s.status;
      await client.query(
        `INSERT INTO ${archivedTbl}
           (student_id, name, gender, branch, enrollment_date, date_of_birth,
            archived_on, guardian_name, guardian_mobile, guardian_email,
            grade_chapter, fa_progress_json, total_fa, pcm_progress_json, total_pcm, status)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,
                 NOW(),$7,$8,$9,
                 $10,$11::jsonb,$12,$13::jsonb,$14,$15)`,
        [
          '—',
          s.name,
          s.gender || 'Male',
          s.branch || branch,
          s.enrollment_date ?? null,
          null,
          '—',
          '—',
          '—',
          s.grade_chapter || 'G1 — C1',
          jsonbStringOf(s.fa_progress_json),
          s.total_fa || '0/0',
          jsonbStringOf(s.pcm_progress_json),
          s.total_pcm || '0/0',
          newStatus,
        ]
      );
      await client.query(
        `DELETE FROM ${studentsTbl} WHERE id = $1`,
        [s.id]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      added: newRows.length,
      restored: restoreRows.length,
      skipped: matchedRows.length,
      archived: archiveRows.length,
    };
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    const msg = err && err.message ? err.message : 'Upload execution failed';
    throw new Error(`Upload transaction rolled back: ${msg}`);
  } finally {
    client.release();
  }
}

module.exports = { executeUpload };
