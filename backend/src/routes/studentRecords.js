const express = require('express');
const { prisma } = require('../prismaClient');
const { pool } = require('../db');
const { getTableNames } = require('../utils/tableNames');
const { computeAgeGroup } = require('../utils/ageGroup');
const { logCreate, logDelete, logArchive, logEdit } = require('../services/studentAuditLog');
const { requireAuth } = require('../middleware/auth');

function userEmailOf(req) {
  return req.user?.email || req.user?.deviceName || 'anonymous';
}

const router = express.Router();
router.use(requireAuth);

// ── helpers ──────────────────────────────────────────────────────────────────

function rowToStudent(r) {
  const [grade = 'G1', chapter = 'C1'] = String(r.grade_chapter || 'G1 — C1').split(' — ');
  return {
    id:             r.id,
    name:           r.name,
    status:         r.status,
    gender:         r.gender,
    branch:         r.branch,
    enrollmentDate: r.enrollment_date ? new Date(r.enrollment_date).toISOString().slice(0, 10) : '',
    dob:            r.dob ? new Date(r.dob).toISOString().slice(0, 10) : '',
    ageGroup:       r.age_group || '',
    grade,
    chapter,
    faAttended:      Array.isArray(r.fa_progress_json)        ? r.fa_progress_json        : [],
    pcmAttended:     Array.isArray(r.pcm_progress_json)       ? r.pcm_progress_json       : [],
    workbookAttended:Array.isArray(r.workbook_progress_json)  ? r.workbook_progress_json  : [],
    guardianName:   r.guardian_name   || '',
    guardianMobile: r.guardian_mobile || '',
    coachName:      r.coach_name      || '',
  };
}

function toTotalStr(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '0/0';
  return `${arr.filter(Boolean).length}/${arr.length}`;
}

// ── GET /api/student-records ─────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    const { students } = getTableNames();
    const { branch } = req.query;
    const rows = await prisma.$queryRawUnsafe(
      branch
        ? `SELECT * FROM ${students} WHERE branch = $1 ORDER BY name ASC`
        : `SELECT * FROM ${students} ORDER BY name ASC`,
      ...(branch ? [branch] : [])
    );
    return res.json({ data: rows.map(rowToStudent) });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/student-records/bulk  (add many at once) ─────────────────────

router.post('/bulk', async (req, res, next) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0)
    return res.status(400).json({ error: 'students array required' });

  try {
    const { students: tbl } = getTableNames();
    for (const s of students) {
      const dobIso = (s.dob && /^\d{4}-\d{2}-\d{2}$/.test(String(s.dob))) ? s.dob : null;
      await prisma.$queryRawUnsafe(
        `INSERT INTO ${tbl}
           (name, status, gender, branch, enrollment_date, dob, age_group, grade_chapter,
            fa_progress_json, total_fa, pcm_progress_json, total_pcm,
            workbook_progress_json, total_workbook,
            guardian_name, guardian_mobile, coach_name)
         VALUES ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9::jsonb,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$17)`,
        s.name,
        s.status || 'Active',
        s.gender || 'Male',
        s.branch || 'ONL',
        (s.enrollmentDate && /^\d{4}-\d{2}-\d{2}$/.test(String(s.enrollmentDate))) ? s.enrollmentDate : null,
        dobIso,
        computeAgeGroup(dobIso),
        `${s.grade || 'G1'} — ${s.chapter || 'C1'}`,
        JSON.stringify(s.faAttended  || []),
        toTotalStr(s.faAttended),
        JSON.stringify(s.pcmAttended || []),
        toTotalStr(s.pcmAttended),
        JSON.stringify(s.workbookAttended || []),
        toTotalStr(s.workbookAttended),
        s.guardianName   || '',
        s.guardianMobile || '',
        s.coachName      || '',
      );
    }
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM ${tbl} ORDER BY name ASC`);
    // Audit log — best effort, fire-and-forget per student
    const userEmail = userEmailOf(req);
    for (const s of students) {
      logCreate({ student: { id: s.id, name: s.name, branch: s.branch || 'ONL' }, userEmail }).catch(() => {});
    }
    return res.json({ ok: true, data: rows.map(rowToStudent) });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ── PUT /api/student-records/:id ─────────────────────────────────────────────

router.put('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  const s  = req.body;
  // Only accept ISO dates (YYYY-MM-DD); pass null otherwise so COALESCE keeps existing value
  const isoDate = s.enrollmentDate && /^\d{4}-\d{2}-\d{2}$/.test(s.enrollmentDate)
    ? s.enrollmentDate
    : null;
  const isoDob = s.dob && /^\d{4}-\d{2}-\d{2}$/.test(s.dob)
    ? s.dob
    : null;
  try {
    const { students: tbl } = getTableNames();
    // Snapshot BEFORE update so we can diff for audit log
    const beforeRows = await prisma.$queryRawUnsafe(`SELECT * FROM ${tbl} WHERE id=$1`, id);
    const beforeStudent = beforeRows[0] ? rowToStudent(beforeRows[0]) : null;
    await prisma.$queryRawUnsafe(
      `UPDATE ${tbl} SET
         name=$1, status=$2, gender=$3, branch=$4,
         enrollment_date = COALESCE($5::date, enrollment_date),
         dob             = COALESCE($6::date, dob),
         age_group       = CASE
           WHEN COALESCE($6::date, dob) IS NULL THEN NULL
           WHEN date_part('year', age(COALESCE($6::date, dob)))::int BETWEEN 4  AND 9  THEN 'JUNIOR'
           WHEN date_part('year', age(COALESCE($6::date, dob)))::int BETWEEN 10 AND 12 THEN 'MIDDLER'
           WHEN date_part('year', age(COALESCE($6::date, dob)))::int BETWEEN 13 AND 20 THEN 'SENIOR'
           ELSE NULL
         END,
         grade_chapter=$7, fa_progress_json=$8::jsonb, total_fa=$9,
         pcm_progress_json=$10::jsonb, total_pcm=$11,
         workbook_progress_json=$12::jsonb, total_workbook=$13,
         guardian_name=$14, guardian_mobile=$15, coach_name=$16
       WHERE id=$17`,
      s.name,
      s.status,
      s.gender,
      s.branch,
      isoDate,
      isoDob,
      `${s.grade} — ${s.chapter}`,
      JSON.stringify(s.faAttended  || []),
      toTotalStr(s.faAttended),
      JSON.stringify(s.pcmAttended || []),
      toTotalStr(s.pcmAttended),
      JSON.stringify(s.workbookAttended || []),
      toTotalStr(s.workbookAttended),
      s.guardianName   ?? '',
      s.guardianMobile ?? '',
      s.coachName      ?? '',
      id,
    );
    const rows = await prisma.$queryRawUnsafe(`SELECT * FROM ${tbl} WHERE id=$1`, id);
    const afterStudent = rows[0] ? rowToStudent(rows[0]) : null;
    if (beforeStudent && afterStudent) {
      logEdit({ before: beforeStudent, after: afterStudent, branch: afterStudent.branch, userEmail: userEmailOf(req) }).catch(() => {});
    }
    return res.json({ ok: true, data: afterStudent });
  } catch (err) {
    return next(err);
  }
});

// ── POST /api/student-records/:id/archive  (single-student archive) ─────────

router.post('/:id/archive', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid student id' });
  }

  const { students: studentsTbl, archived: archivedTbl } = getTableNames();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sel = await client.query(
      `SELECT name, status, gender, branch, enrollment_date, dob, grade_chapter,
              fa_progress_json, total_fa, pcm_progress_json, total_pcm,
              workbook_progress_json, total_workbook,
              guardian_name, guardian_mobile, coach_name
         FROM ${studentsTbl} WHERE id = $1`,
      [id]
    );
    if (sel.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found' });
    }
    const s = sel.rows[0];

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
        s.branch || '',
        s.enrollment_date,
        s.dob,
        s.guardian_name   || '',
        s.guardian_mobile || '',
        '',
        s.grade_chapter || 'G1 — C1',
        JSON.stringify(Array.isArray(s.fa_progress_json) ? s.fa_progress_json : []),
        s.total_fa || '0/0',
        JSON.stringify(Array.isArray(s.pcm_progress_json) ? s.pcm_progress_json : []),
        s.total_pcm || '0/0',
        JSON.stringify(Array.isArray(s.workbook_progress_json) ? s.workbook_progress_json : []),
        s.total_workbook || '0/0',
        s.status === 'Active' ? 'Inactive' : (s.status || 'Inactive'),
        s.coach_name || '',
      ]
    );

    await client.query(`DELETE FROM ${studentsTbl} WHERE id = $1`, [id]);

    await client.query('COMMIT');
    logArchive({ studentId: id, name: s.name, branch: s.branch || '', userEmail: userEmailOf(req) }).catch(() => {});
    return res.json({ success: true, archived: s.name });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    return next(err);
  } finally {
    client.release();
  }
});

// ── DELETE /api/student-records  (delete ALL or by branch) ──────────────────

router.delete('/', async (req, res, next) => {
  const { branch } = req.query;
  try {
    const { students: tbl } = getTableNames();
    if (branch && branch !== 'All') {
      await prisma.$queryRawUnsafe(`DELETE FROM ${tbl} WHERE branch=$1`, branch);
    } else {
      await prisma.$queryRawUnsafe(`DELETE FROM ${tbl}`);
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// ── DELETE /api/student-records/:id ─────────────────────────────────────────

router.delete('/:id', async (req, res, next) => {
  const id = parseInt(req.params.id, 10);
  try {
    const { students: tbl } = getTableNames();
    // Snapshot before delete so we can log name/branch
    const beforeRows = await prisma.$queryRawUnsafe(`SELECT name, branch FROM ${tbl} WHERE id=$1`, id);
    await prisma.$queryRawUnsafe(`DELETE FROM ${tbl} WHERE id=$1`, id);
    if (beforeRows[0]) {
      logDelete({ studentId: id, name: beforeRows[0].name, branch: beforeRows[0].branch, userEmail: userEmailOf(req) }).catch(() => {});
    }
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

module.exports = { studentRecordsRouter: router };
