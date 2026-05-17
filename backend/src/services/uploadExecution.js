const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');
const { computeAgeGroup } = require('../utils/ageGroup');
const { logCreate, logArchive, logRestore, logField } = require('./studentAuditLog');

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

function isBlank(v) {
  return v === null || v === undefined || String(v).trim() === '';
}

async function executeUpload(categorized, branch, userEmail = 'anonymous') {
  const { students: studentsTbl, archived: archivedTbl } = getTableNames();

  const newRows     = Array.isArray(categorized?.new)     ? categorized.new     : [];
  const restoreRows = Array.isArray(categorized?.restore) ? categorized.restore : [];
  const archiveRows = Array.isArray(categorized?.archive) ? categorized.archive : [];
  const matchedRows = Array.isArray(categorized?.matched) ? categorized.matched : [];

  let guardianFilled = 0;
  let dobFilled = 0;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const auditEvents = []; // collected during transaction, logged after COMMIT
    for (const row of newRows) {
      const dobIso = isoOrNull(row.dob);
      // New students default to G1 — C1, which means 1 workbook tickbox per the spec.
      await client.query(
        `INSERT INTO ${studentsTbl}
           (name, status, gender, branch, enrollment_date, dob, age_group, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm,
            workbook_progress_json, total_workbook,
            guardian_name, guardian_mobile)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16)`,
        [
          row.name,
          row.status || 'Active',
          row.gender || 'Male',
          branch,
          isoOrNull(row.enrollmentDate),
          dobIso,
          computeAgeGroup(dobIso),
          'G1 — C1',
          '[]',
          '0/0',
          '[]',
          '0/0',
          '[false]',
          '0/1',
          row.guardianName   || '',
          row.guardianMobile || '',
        ]
      );
      auditEvents.push({ type: 'create', name: row.name, branch });
    }

    for (const item of restoreRows) {
      const a = item.archived;
      const e = item.excel || {};
      // Prefer archive's existing DOB; fall back to Excel DOB if archive had none.
      const restoredDob = isoOrNull(a.date_of_birth) || isoOrNull(e.dob);
      await client.query(
        `INSERT INTO ${studentsTbl}
           (name, status, gender, branch, enrollment_date, dob, age_group, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm,
            workbook_progress_json, total_workbook,
            guardian_name, guardian_mobile, coach_name)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$17)`,
        [
          a.name,
          'Active',
          a.gender || 'Male',
          a.branch || branch,
          isoOrNull(a.enrollment_date),
          restoredDob,
          computeAgeGroup(restoredDob),
          a.grade_chapter || 'G1 — C1',
          jsonbStringOf(a.fa_progress_json),
          a.total_fa || '0/0',
          jsonbStringOf(a.pcm_progress_json),
          a.total_pcm || '0/0',
          jsonbStringOf(a.workbook_progress_json),
          a.total_workbook || '0/0',
          a.guardian_name   || '',
          a.guardian_mobile || '',
          a.coach_name      || '',
        ]
      );
      await client.query(
        `DELETE FROM ${archivedTbl} WHERE no = $1`,
        [a.no]
      );
      auditEvents.push({ type: 'restore', name: a.name, branch: a.branch || branch });
    }

    for (const s of archiveRows) {
      const newStatus = s.status === 'Active' ? 'Inactive' : s.status;
      await client.query(
        `INSERT INTO ${archivedTbl}
           (student_id, name, gender, branch, enrollment_date, date_of_birth,
            archived_on, guardian_name, guardian_mobile, guardian_email,
            grade_chapter, fa_progress_json, total_fa, pcm_progress_json, total_pcm,
            workbook_progress_json, total_workbook, status, coach_name)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,
                 NOW(),$7,$8,$9,
                 $10,$11::jsonb,$12,$13::jsonb,$14,
                 $15::jsonb,$16,$17,$18)`,
        [
          '—',
          s.name,
          s.gender || 'Male',
          s.branch || branch,
          s.enrollment_date ?? null,
          s.dob ?? null,
          s.guardian_name   || '',
          s.guardian_mobile || '',
          '',
          s.grade_chapter || 'G1 — C1',
          jsonbStringOf(s.fa_progress_json),
          s.total_fa || '0/0',
          jsonbStringOf(s.pcm_progress_json),
          s.total_pcm || '0/0',
          jsonbStringOf(s.workbook_progress_json),
          s.total_workbook || '0/0',
          newStatus,
          s.coach_name || '',
        ]
      );
      await client.query(
        `DELETE FROM ${studentsTbl} WHERE id = $1`,
        [s.id]
      );
      auditEvents.push({ type: 'archive', studentId: s.id, name: s.name, branch: s.branch || branch });
    }

    // MATCH path: only fill empty guardian + DOB fields. Never touch name/branch/grade/FA/PCM/etc.
    for (const item of matchedRows) {
      const e = item.excel || {};
      const d = item.db    || {};
      const excelName   = isBlank(e.guardianName)   ? '' : String(e.guardianName).trim();
      const excelMobile = isBlank(e.guardianMobile) ? '' : String(e.guardianMobile).trim();
      const excelDob    = isoOrNull(e.dob);
      const needsName   = isBlank(d.guardian_name)   && !!excelName;
      const needsMobile = isBlank(d.guardian_mobile) && !!excelMobile;
      const needsDob    = (d.dob === null || d.dob === undefined) && !!excelDob;
      let didSomething  = false;

      if (needsName && needsMobile) {
        await client.query(
          `UPDATE ${studentsTbl} SET guardian_name = $1, guardian_mobile = $2 WHERE id = $3`,
          [excelName, excelMobile, d.id]
        );
        didSomething = true;
      } else if (needsName) {
        await client.query(
          `UPDATE ${studentsTbl} SET guardian_name = $1 WHERE id = $2`,
          [excelName, d.id]
        );
        didSomething = true;
      } else if (needsMobile) {
        await client.query(
          `UPDATE ${studentsTbl} SET guardian_mobile = $1 WHERE id = $2`,
          [excelMobile, d.id]
        );
        didSomething = true;
      }
      if (needsName || needsMobile) guardianFilled++;
      // Audit log for backfilled guardian fields
      if (needsName)   auditEvents.push({ type: 'field', studentId: d.id, name: d.name, branch: d.branch || branch, field: 'guardianName',   oldValue: d.guardian_name   || '', newValue: excelName });
      if (needsMobile) auditEvents.push({ type: 'field', studentId: d.id, name: d.name, branch: d.branch || branch, field: 'guardianMobile', oldValue: d.guardian_mobile || '', newValue: excelMobile });

      if (needsDob) {
        await client.query(
          `UPDATE ${studentsTbl} SET dob = $1::date, age_group = $2 WHERE id = $3`,
          [excelDob, computeAgeGroup(excelDob), d.id]
        );
        dobFilled++;
        didSomething = true;
        auditEvents.push({ type: 'field', studentId: d.id, name: d.name, branch: d.branch || branch, field: 'dob', oldValue: '', newValue: excelDob });
      }
      // didSomething is informational; the skipped count below uses combined filled counts.
      void didSomething;
    }

    await client.query('COMMIT');

    // Fire-and-forget audit logging — never blocks or fails the upload
    for (const ev of auditEvents) {
      if (ev.type === 'create')      logCreate({ student: { id: null, name: ev.name, branch: ev.branch }, userEmail }).catch(() => {});
      else if (ev.type === 'restore') logRestore({ studentId: null, name: ev.name, branch: ev.branch, userEmail }).catch(() => {});
      else if (ev.type === 'archive') logArchive({ studentId: ev.studentId, name: ev.name, branch: ev.branch, userEmail }).catch(() => {});
      else if (ev.type === 'field')   logField({ studentId: ev.studentId, name: ev.name, branch: ev.branch, field: ev.field, oldValue: ev.oldValue, newValue: ev.newValue, userEmail }).catch(() => {});
    }

    const matchedHandled = matchedRows.filter(item => {
      const e = item.excel || {};
      const d = item.db    || {};
      const hasGuardian = (isBlank(d.guardian_name)   && !isBlank(e.guardianName))
                       || (isBlank(d.guardian_mobile) && !isBlank(e.guardianMobile));
      const hasDob      = (d.dob === null || d.dob === undefined) && !!isoOrNull(e.dob);
      return hasGuardian || hasDob;
    }).length;

    return {
      success: true,
      added: newRows.length,
      restored: restoreRows.length,
      skipped: matchedRows.length - matchedHandled,
      guardianFilled,
      dobFilled,
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
